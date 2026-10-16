import { DatabaseSync, backup as sqliteBackup } from "node:sqlite";
import { randomUUID, createHash } from "node:crypto";
import { hash, verify, Algorithm } from "@node-rs/argon2";
import { schema } from "./schema";
import { migration2 } from "./migrations";
import { License } from "./license";
import { schemas, type Command } from "./contracts";
import { ratio } from "./money";
type Row = Record<string, any>;
export class Store {
  db: DatabaseSync;
  session?: { id: string; username: string; role: string; mustChange: boolean };
  busy = false;
  constructor(
    public path: string,
    public license: License,
    private now = () => Date.now(),
  ) {
    this.db = new DatabaseSync(path);
    this.db.exec(
      "PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;",
    );
    const version = Number(
      this.db.prepare("PRAGMA user_version").get()!.user_version,
    );
    if (version > 2) throw new Error("مخطط أحدث من البرنامج");
    if (version === 0) {
      this.db.exec("BEGIN IMMEDIATE");
      try {
        this.db.exec(schema);
        this.db.exec("COMMIT");
      } catch (e) {
        this.db.exec("ROLLBACK");
        throw e;
      }
    }
    if (version < 2) {
      if (version > 0 && path !== ":memory:")
        this.db
          .prepare("VACUUM INTO ?")
          .run(path + ".before-schema-2-" + Date.now() + ".sqlite");
      this.db.exec("BEGIN IMMEDIATE");
      try {
        this.db.exec(migration2);
        this.db.exec("COMMIT");
      } catch (e) {
        this.db.exec("ROLLBACK");
        throw e;
      }
    }
  }
  one(sql: string, ...args: any[]): Row | undefined {
    return this.db.prepare(sql).get(...args);
  }
  all(sql: string, ...args: any[]): Row[] {
    return this.db.prepare(sql).all(...args);
  }
  run(sql: string, ...args: any[]) {
    return this.db.prepare(sql).run(...args);
  }
  stamp() {
    return new Date(this.now()).toISOString();
  }
  audit(action: string, subject: string) {
    this.run(
      "INSERT INTO audit VALUES(?,?,?,?,?)",
      randomUUID(),
      this.session?.id || null,
      this.stamp(),
      action,
      subject,
    );
  }
  auth(permission: string, write = true) {
    if (!this.session) throw new Error("سجل الدخول أولًا");
    const user = this.one("SELECT * FROM users WHERE id=?", this.session.id);
    if (!user) throw new Error("الحساب غير متاح");
    this.session.role = user.role;
    this.session.mustChange = !!user.must_change;
    if (user.must_change) throw new Error("غيّر كلمة المرور المؤقتة أولًا");
    const allowed: Record<string, string[]> = {
      manager: [
        "view",
        "cost",
        "products",
        "pricing",
        "parties",
        "purchase",
        "sale",
        "discount",
        "credit",
        "return",
        "shift",
        "cash",
        "adjust",
        "users",
        "backup",
        "restore",
        "export",
        "print",
        "hold",
      ],
      cashier: ["view", "sale", "return", "shift", "print", "hold"],
      stock: ["view", "cost", "products", "purchase", "adjust", "backup"],
    };
    if (!allowed[user.role]?.includes(permission))
      throw new Error("غير مسموح بهذه العملية");
    if (write) this.license.require();
    return user;
  }
  transaction<T>(action: () => T): T {
    if (this.busy) throw new Error("عملية تخزين أخرى قيد التنفيذ");
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const result = action();
      this.db.exec("COMMIT");
      return result;
    } catch (e) {
      this.db.exec("ROLLBACK");
      throw e;
    }
  }
  operation(input: any, action: () => any) {
    const fingerprint = createHash("sha256")
      .update(JSON.stringify({ actor: this.session?.id, input }))
      .digest("hex");
    return this.transaction(() => {
      const existing = this.one(
        "SELECT * FROM operations WHERE id=?",
        input.operationId,
      );
      if (existing) {
        if (existing.fingerprint !== fingerprint)
          throw new Error("معرف العملية مستخدم لطلب مختلف");
        return JSON.parse(existing.result);
      }
      const result = action();
      this.run(
        "INSERT INTO operations VALUES(?,?,?)",
        input.operationId,
        fingerprint,
        JSON.stringify(result),
      );
      return result;
    });
  }
  async passwordHash(password: string) {
    return hash(password, {
      algorithm: Algorithm.Argon2id,
      memoryCost: 19456,
      timeCost: 2,
      parallelism: 1,
    });
  }
  async confirm(password: string) {
    if (!this.session) throw new Error("سجل الدخول");
    const u = this.one("SELECT * FROM users WHERE id=?", this.session.id)!;
    if (!(await verify(u.hash, password)))
      throw new Error("كلمة المرور غير صحيحة");
  }
  async execute(command: Command, raw: unknown): Promise<any> {
    const p: any = schemas[command].parse(raw);
    if (command === "bootstrap")
      return {
        license: this.license.status(),
        hasManager: !!this.one("SELECT id FROM users LIMIT 1"),
        session: this.session,
        business:
          this.one("SELECT value FROM settings WHERE key='business'")?.value ||
          "",
      };
    if (command === "setup") {
      this.license.require();
      const hashed = await this.passwordHash(p.password);
      return this.transaction(() => {
        if (this.one("SELECT id FROM users LIMIT 1"))
          throw new Error("تم إعداد المدير");
        const id = randomUUID();
        this.run(
          "INSERT INTO users(id,username,hash,role) VALUES(?,?,?,?)",
          id,
          p.username,
          hashed,
          "manager",
        );
        this.run("INSERT INTO settings VALUES(?,?)", "business", p.business);
        this.audit("setup", id);
        return { id };
      });
    }
    if (command === "login") {
      const u = this.one("SELECT * FROM users WHERE username=?", p.username);
      if (u?.locked_until > this.now())
        throw new Error("الحساب مقفول مؤقتًا. حاول بعد 15 دقيقة");
      // Unknown users also pay the Argon2 verification cost, limiting account timing disclosure.
      const valid = u
        ? await verify(u.hash, p.password)
        : await verify(
            await this.passwordHash("unknown-user-dummy"),
            p.password,
          );
      if (!u || !valid) {
        if (u)
          this.run(
            "UPDATE users SET attempts=attempts+1,locked_until=? WHERE id=?",
            u.attempts + 1 >= 5 ? this.now() + 900000 : 0,
            u.id,
          );
        this.audit("login-failed", u?.id || "unknown");
        throw new Error("اسم المستخدم أو كلمة المرور غير صحيحة");
      }
      this.run("UPDATE users SET attempts=0,locked_until=0 WHERE id=?", u.id);
      this.session = {
        id: u.id,
        username: u.username,
        role: u.role,
        mustChange: !!u.must_change,
      };
      this.audit("login", u.id);
      return this.session;
    }
    if (command === "logout") {
      this.audit("logout", this.session?.id || "");
      this.session = undefined;
      return {};
    }
    if (command === "password") {
      await this.confirm(p.oldPassword);
      const hashed = await this.passwordHash(p.newPassword);
      this.run(
        "UPDATE users SET hash=?,must_change=0 WHERE id=?",
        hashed,
        this.session!.id,
      );
      this.session!.mustChange = false;
      this.audit("password-change", this.session!.id);
      return {};
    }
    if (command === "userCreate") {
      this.auth("users");
      const hashed = await this.passwordHash(p.password);
      const id = randomUUID();
      this.run(
        "INSERT INTO users(id,username,hash,role,must_change) VALUES(?,?,?,?,1)",
        id,
        p.username,
        hashed,
        p.role,
      );
      this.audit("user-create", id);
      return { id };
    }
    if (command === "userReset") {
      this.auth("users");
      await this.confirm(p.managerPassword);
      const hashed = await this.passwordHash(p.password);
      if (!this.one("SELECT id FROM users WHERE id=?", p.userId))
        throw new Error("الحساب غير موجود");
      this.run(
        "UPDATE users SET hash=?,must_change=1,attempts=0,locked_until=0 WHERE id=?",
        hashed,
        p.userId,
      );
      this.audit("user-reset", p.userId);
      return {};
    }
    if (command === "snapshot") {
      this.auth("view", false);
      return this.snapshot();
    }
    if (command === "report") {
      this.auth("cost", false);
      return this.report(p.from, p.to);
    }
    if (command === "productCreate") {
      this.auth("products");
      const id = randomUUID();
      this.run(
        "INSERT INTO products(id,name,barcode,category,base_unit,pack_name,pack_factor,retail,wholesale,purchase,reorder) VALUES(?,?,?,?,?,?,?,?,?,?,?)",
        id,
        p.name,
        p.barcode,
        p.category,
        p.baseUnit,
        p.packName,
        p.packFactor,
        p.retail,
        p.wholesale,
        p.purchase,
        p.reorder,
      );
      this.audit("product-create", id);
      return { id };
    }
    if (command === "productUpdate") {
      this.auth("pricing");
      const product = this.product(p.id);
      this.run(
        "UPDATE products SET name=?,category=?,retail=?,wholesale=?,purchase=?,reorder=? WHERE id=?",
        p.name,
        p.category,
        p.retail,
        p.wholesale,
        p.purchase,
        p.reorder,
        product.id,
      );
      this.audit("product-update", product.id);
      return { id: product.id };
    }
    if (command === "partyCreate") {
      this.auth("parties");
      const id = randomUUID();
      this.run(
        "INSERT INTO parties VALUES(?,?,?,?,?,?)",
        id,
        p.name,
        p.kind,
        p.opening,
        p.creditLimit,
        p.reason,
      );
      this.audit("party-opening", id);
      return { id };
    }
    if (command === "shiftOpen") {
      this.auth("shift");
      return this.operation(p, () => {
        const id = randomUUID();
        this.run(
          "INSERT INTO shifts(id,actor,opened,float) VALUES(?,?,?,?)",
          id,
          this.session!.id,
          this.stamp(),
          p.float,
        );
        this.audit("shift-open", id);
        return { id };
      });
    }
    if (command === "shiftClose") {
      this.auth("shift", false);
      return this.operation(p, () => {
        const shift = this.currentShift();
        const expected = this.expected(shift.id);
        if (expected !== p.actual && p.reason.length < 3)
          throw new Error("سبب فرق النقدية مطلوب");
        this.run(
          "UPDATE shifts SET closed=?,expected=?,actual=?,difference=?,reason=? WHERE id=?",
          this.stamp(),
          expected,
          p.actual,
          p.actual - expected,
          p.reason,
          shift.id,
        );
        this.audit("shift-close", shift.id);
        return {
          id: shift.id,
          expected,
          actual: p.actual,
          difference: p.actual - expected,
        };
      });
    }
    if (command === "cash") {
      this.auth("cash");
      return this.operation(p, () => {
        const shift = this.currentShift();
        const amount = p.kind === "deposit" ? p.amount : -p.amount;
        if (this.expected(shift.id) + amount < 0)
          throw new Error("النقدية غير كافية");
        const id = randomUUID();
        this.run(
          "INSERT INTO cash_events VALUES(?,?,?,?,?,?,?)",
          id,
          shift.id,
          this.session!.id,
          this.stamp(),
          p.kind,
          amount,
          p.reason,
        );
        this.audit("cash-" + p.kind, id);
        return { id };
      });
    }
    if (command === "purchase" || command === "sale")
      return this.post(command, p);
    if (command === "return") return this.returnDocument(p);
    if (command === "adjust") {
      this.auth("adjust");
      return this.operation(p, () => {
        const product = this.product(p.productId);
        const delta = p.counted - product.quantity;
        if (delta > 0 && !product.quantity && !product.purchase)
          throw new Error("حدد تكلفة الشراء قبل التسوية الموجبة");
        const value =
          delta >= 0
            ? product.quantity
              ? ratio(product.value, delta, product.quantity)
              : ratio(product.purchase, delta, 1000)
            : -this.takeCost(product, -delta);
        this.move(product.id, delta, value, null, p.reason);
        this.audit("inventory-adjust", product.id);
        return { quantity: p.counted, value: product.value + value };
      });
    }
    if (command === "partyPay") {
      this.auth("parties");
      return this.operation(p, () => {
        const party = this.party(p.partyId);
        const balance = this.balance(party.id);
        if (p.amount > balance) throw new Error("الدفعة أكبر من المديونية");
        const shift = p.method === "cash" ? this.currentShift() : undefined;
        const amount = party.kind === "customer" ? p.amount : -p.amount;
        if (shift && this.expected(shift.id) + amount < 0)
          throw new Error("النقدية غير كافية");
        const id = randomUUID();
        let remaining = p.amount;
        const direction = party.kind === "customer" ? 1 : -1;
        const openingPaid =
          Number(
            this.one(
              "SELECT COALESCE(SUM(amount),0) n FROM payments WHERE party=? AND document IS NULL",
              party.id,
            )!.n,
          ) * direction;
        const openingPart = Math.min(
          remaining,
          Math.max(0, party.opening - openingPaid),
        );
        const allocations: { document: string | null; amount: number }[] = [];
        if (openingPart) {
          allocations.push({ document: null, amount: openingPart });
          remaining -= openingPart;
        }
        for (const doc of this.all(
          "SELECT id FROM documents WHERE party=? AND kind IN ('sale','purchase') ORDER BY created,id",
          party.id,
        )) {
          if (!remaining) break;
          const part = Math.min(remaining, this.documentOutstanding(doc.id));
          if (part) {
            allocations.push({ document: doc.id, amount: part });
            remaining -= part;
          }
        }
        if (remaining) allocations.push({ document: null, amount: remaining });
        for (const a of allocations)
          this.run(
            "INSERT INTO payments VALUES(?,?,?,?,?,?,?,?)",
            randomUUID(),
            a.document,
            party.id,
            shift?.id || null,
            this.stamp(),
            p.method,
            a.amount * direction,
            p.reason,
          );
        this.audit("party-payment", id);
        return { id, allocations };
      });
    }
    if (command === "hold") {
      this.auth("hold");
      return this.operation(p, () => {
        const id = randomUUID();
        this.run(
          "INSERT INTO holds VALUES(?,?,?,?)",
          id,
          this.session!.id,
          p.label,
          JSON.stringify(p.cart),
        );
        return { id };
      });
    }
    if (command === "holdDelete") {
      this.auth("hold");
      this.run(
        "DELETE FROM holds WHERE id=? AND actor=?",
        p.id,
        this.session!.id,
      );
      return {};
    }
    throw new Error("هذا الأمر يتطلب adapter مكتبي");
  }
  product(id: string) {
    const p = this.one("SELECT * FROM products WHERE id=?", id);
    if (!p) throw new Error("المنتج غير موجود");
    return p;
  }
  party(id: string) {
    const p = this.one("SELECT * FROM parties WHERE id=?", id);
    if (!p) throw new Error("الطرف غير موجود");
    return p;
  }
  currentShift() {
    const s = this.one("SELECT * FROM shifts WHERE closed IS NULL");
    if (!s) throw new Error("افتح وردية أولًا");
    if (this.session?.role !== "manager" && s.actor !== this.session?.id)
      throw new Error("الوردية تخص مستخدمًا آخر");
    return s;
  }
  expected(id: string) {
    return Number(
      this.one(
        "SELECT float + COALESCE((SELECT SUM(amount) FROM payments WHERE shift=? AND method='cash'),0) + COALESCE((SELECT SUM(amount) FROM cash_events WHERE shift=?),0) AS value FROM shifts WHERE id=?",
        id,
        id,
        id,
      )!.value,
    );
  }
  takeCost(p: Row, quantity: number) {
    if (quantity > p.quantity) throw new Error("المخزون غير كافٍ: " + p.name);
    return quantity === p.quantity
      ? p.value
      : ratio(p.value, quantity, p.quantity);
  }
  move(
    product: string,
    quantity: number,
    value: number,
    document: string | null,
    reason: string,
  ) {
    const current = this.product(product);
    if (
      !Number.isSafeInteger(current.quantity + quantity) ||
      !Number.isSafeInteger(current.value + value) ||
      current.quantity + quantity > 1_000_000_000_000 ||
      current.value + value > 1_000_000_000_000
    )
      throw new Error("تجاوز حد دقة المخزون");
    this.run(
      "UPDATE products SET quantity=quantity+?,value=value+? WHERE id=?",
      quantity,
      value,
      product,
    );
    this.run(
      "INSERT INTO movements VALUES(?,?,?,?,?,?,?,?)",
      randomUUID(),
      product,
      document,
      this.session!.id,
      this.stamp(),
      quantity,
      value,
      reason,
    );
  }
  balance(id: string) {
    const party = this.party(id);
    const sale = party.kind === "customer";
    const docs = this.one(
      "SELECT COALESCE(SUM(CASE WHEN kind IN ('sale','purchase') THEN total ELSE -total END),0) AS value FROM documents WHERE party=?",
      id,
    )!.value;
    const paid = this.one(
      "SELECT COALESCE(SUM(amount),0) AS value FROM payments WHERE party=?",
      id,
    )!.value;
    return party.opening + Number(docs) - (sale ? Number(paid) : -Number(paid));
  }
  documentOutstanding(id: string) {
    const doc = this.one("SELECT * FROM documents WHERE id=?", id)!;
    const returns = Number(
      this.one(
        "SELECT COALESCE(SUM(total),0) n FROM documents WHERE parent=?",
        id,
      )!.n,
    );
    const paid =
      Number(
        this.one(
          "SELECT COALESCE(SUM(amount),0) n FROM payments WHERE document=? OR document IN (SELECT id FROM documents WHERE parent=?)",
          id,
          id,
        )!.n,
      ) * (doc.kind === "sale" ? 1 : -1);
    return Math.max(0, doc.total - returns - paid);
  }
  post(kind: "sale" | "purchase", p: any) {
    this.auth(kind);
    return this.operation({ ...p, kind }, () => {
      if (new Set(p.lines.map((l: any) => l.productId)).size !== p.lines.length)
        throw new Error("اجمع كميات المنتج المكرر في سطر واحد");
      let shift: Row | undefined;
      if (kind === "sale" || p.payments.some((x: any) => x.method === "cash"))
        shift = this.currentShift();
      const party = p.partyId ? this.party(p.partyId) : undefined;
      if (party && party.kind !== (kind === "sale" ? "customer" : "supplier"))
        throw new Error("نوع الطرف غير مناسب");
      const lines = p.lines.map((l: any) => {
        const product = this.product(l.productId);
        const quantity =
          l.unit === "pack"
            ? ratio(l.quantity, product.pack_factor, 1000)
            : l.quantity;
        if (!quantity) throw new Error("كمية أقل من دقة التخزين");
        if (
          kind === "sale" &&
          l.price !==
            ratio(
              product.retail,
              l.unit === "pack" ? product.pack_factor : 1000,
              1000,
            ) &&
          l.price !==
            ratio(
              product.wholesale,
              l.unit === "pack" ? product.pack_factor : 1000,
              1000,
            )
        )
          this.auth("discount");
        const gross = ratio(l.price, l.quantity, 1000);
        const cost = kind === "sale" ? this.takeCost(product, quantity) : gross;
        return { ...l, product, quantity, gross, cost };
      });
      const gross = lines.reduce((s: number, l: any) => s + l.gross, 0),
        discount = kind === "sale" ? p.discount : 0;
      if (discount > gross) throw new Error("الخصم أكبر من الفاتورة");
      if (discount) this.auth("discount");
      const total = gross - discount,
        paid = p.payments.reduce((s: number, x: any) => s + x.amount, 0);
      if (!Number.isSafeInteger(total) || total > 1_000_000_000 || paid > total)
        throw new Error("قيمة أو دفعة غير صالحة");
      if (paid < total) {
        if (!party) throw new Error("اختر طرفًا للبيع أو الشراء الآجل");
        if (kind === "sale") {
          this.auth("credit");
          if (
            party!.credit_limit &&
            this.balance(party!.id) + total - paid > party!.credit_limit
          )
            throw new Error("تجاوز الحد الائتماني");
        }
      }
      if (kind === "purchase" && shift) {
        const cash = p.payments
          .filter((x: any) => x.method === "cash")
          .reduce((s: number, x: any) => s + x.amount, 0);
        if (cash > this.expected(shift.id))
          throw new Error("النقدية غير كافية");
      }
      const id = randomUUID(),
        cost = lines.reduce((s: number, l: any) => s + l.cost, 0);
      this.run(
        "INSERT INTO documents VALUES(?,?,?,?,?,?,?,?,?,?,?)",
        id,
        kind,
        null,
        this.session!.id,
        party?.id || null,
        shift?.id || null,
        this.stamp(),
        total,
        cost,
        discount,
        null,
      );
      let previousGross = 0,
        previousDiscount = 0;
      for (const l of lines) {
        previousGross += l.gross;
        const cumulative = gross ? ratio(discount, previousGross, gross) : 0;
        const allocated = cumulative - previousDiscount;
        previousDiscount = cumulative;
        this.run(
          "INSERT INTO lines VALUES(?,?,?,?,?,?,?,?,?,?,?)",
          randomUUID(),
          id,
          l.product.id,
          l.quantity,
          l.price,
          l.gross - allocated,
          l.cost,
          null,
          l.product.name,
          l.product.barcode,
          l.product.base_unit,
        );
        this.move(
          l.product.id,
          kind === "sale" ? -l.quantity : l.quantity,
          kind === "sale" ? -l.cost : l.cost,
          id,
          kind,
        );
      }
      for (const pay of p.payments)
        this.run(
          "INSERT INTO payments VALUES(?,?,?,?,?,?,?,?)",
          randomUUID(),
          id,
          party?.id || null,
          shift?.id || null,
          this.stamp(),
          pay.method,
          kind === "sale" ? pay.amount : -pay.amount,
          null,
        );
      this.audit("document-" + kind, id);
      return {
        id,
        total,
        cost,
        grossProfit: kind === "sale" ? total - cost : undefined,
      };
    });
  }
  returnDocument(p: any) {
    this.auth("return");
    return this.operation({ ...p, kind: "return" }, () => {
      const doc = this.one("SELECT * FROM documents WHERE id=?", p.documentId);
      if (!doc || !["sale", "purchase"].includes(doc.kind))
        throw new Error("مستند أصلي غير صالح");
      if (doc.kind === "purchase") this.auth("purchase");
      if (new Set(p.lines.map((x: any) => x.lineId)).size !== p.lines.length)
        throw new Error("سطر مرتجع مكرر");
      const shift = p.method === "cash" ? this.currentShift() : undefined;
      let total = 0,
        cost = 0;
      const lines = p.lines.map((l: any) => {
        const original = this.one(
          "SELECT * FROM lines WHERE id=? AND document=?",
          l.lineId,
          doc.id,
        );
        if (!original) throw new Error("السطر غير تابع للفاتورة");
        const previous = Number(
          this.one(
            "SELECT COALESCE(SUM(quantity),0) AS q FROM lines WHERE original=?",
            original.id,
          )!.q,
        );
        if (previous + l.quantity > original.quantity)
          throw new Error("كمية المرتجع أكبر من المتبقي");
        const net =
          ratio(original.net, previous + l.quantity, original.quantity) -
          ratio(original.net, previous, original.quantity);
        const c =
          ratio(original.cost, previous + l.quantity, original.quantity) -
          ratio(original.cost, previous, original.quantity);
        const product = this.product(original.product);
        const movementCost =
          doc.kind === "sale" ? c : this.takeCost(product, l.quantity);
        total += net;
        cost += c;
        return { ...l, original, net, c, movementCost };
      });
      // Refund only paid amount; credit returns reduce outstanding debt before refund.
      const remainingDebt = doc.party ? this.documentOutstanding(doc.id) : 0;
      const credit = Math.min(total, remainingDebt);
      const refund = total - credit;
      if (refund && p.method === "credit")
        throw new Error("هذا المرتجع يتطلب رد مبلغ مدفوع");
      if (doc.kind === "sale" && shift && refund > this.expected(shift.id))
        throw new Error("النقدية غير كافية للمرتجع");
      const id = randomUUID();
      const kind = doc.kind === "sale" ? "sale-return" : "purchase-return";
      this.run(
        "INSERT INTO documents VALUES(?,?,?,?,?,?,?,?,?,?,?)",
        id,
        kind,
        doc.id,
        this.session!.id,
        doc.party,
        shift?.id || null,
        this.stamp(),
        total,
        cost,
        0,
        p.reason,
      );
      for (const l of lines) {
        this.run(
          "INSERT INTO lines VALUES(?,?,?,?,?,?,?,?,?,?,?)",
          randomUUID(),
          id,
          l.original.product,
          l.quantity,
          l.original.price,
          l.net,
          l.c,
          l.original.id,
          l.original.product_name,
          l.original.product_barcode,
          l.original.base_unit,
        );
        this.move(
          l.original.product,
          doc.kind === "sale" ? l.quantity : -l.quantity,
          doc.kind === "sale" ? l.movementCost : -l.movementCost,
          id,
          p.reason,
        );
      }
      if (refund)
        this.run(
          "INSERT INTO payments VALUES(?,?,?,?,?,?,?,?)",
          randomUUID(),
          id,
          doc.party,
          shift?.id || null,
          this.stamp(),
          p.method,
          doc.kind === "sale" ? -refund : refund,
          p.reason,
        );
      this.audit("document-return", id);
      return { id, total, cost, refund, credit };
    });
  }
  exportData() {
    this.auth("export", false);
    return this.transaction(() => ({
      schema: 2,
      exportedAt: this.stamp(),
      settings: this.all("SELECT * FROM settings"),
      scopes: this.all("SELECT * FROM scopes"),
      products: this.all("SELECT * FROM products"),
      parties: this.all("SELECT * FROM parties").map((p) => ({
        ...p,
        balance: this.balance(p.id),
      })),
      users: this.all("SELECT id,username,role,must_change FROM users"),
      documents: this.all("SELECT * FROM documents"),
      lines: this.all("SELECT * FROM lines"),
      movements: this.all("SELECT * FROM movements"),
      payments: this.all("SELECT * FROM payments"),
      shifts: this.all("SELECT * FROM shifts"),
      cashEvents: this.all("SELECT * FROM cash_events"),
      audit: this.all("SELECT * FROM audit"),
      holds: this.all("SELECT * FROM holds"),
    }));
  }
  snapshot() {
    const cost = this.session!.role !== "cashier";
    const products = this.all("SELECT * FROM products").map((p) =>
      cost ? p : (({ value, purchase, ...rest }) => rest)(p),
    );
    return {
      products,
      parties: cost
        ? this.all("SELECT * FROM parties").map((p) => ({
            ...p,
            balance: this.balance(p.id),
          }))
        : this.all("SELECT id,name,kind FROM parties WHERE kind='customer'"),
      users:
        this.session!.role === "manager"
          ? this.all("SELECT id,username,role,must_change FROM users")
          : [],
      shifts: this.all("SELECT * FROM shifts ORDER BY opened DESC LIMIT 100"),
      currentShift: this.one("SELECT * FROM shifts WHERE closed IS NULL")
        ? {
            ...this.one("SELECT * FROM shifts WHERE closed IS NULL"),
            expected: this.expected(
              this.one("SELECT id FROM shifts WHERE closed IS NULL")!.id,
            ),
          }
        : null,
      documents: this.all(
        "SELECT d.*,u.username,p.name AS party_name FROM documents d JOIN users u ON u.id=d.actor LEFT JOIN parties p ON p.id=d.party ORDER BY created DESC LIMIT 300",
      ).map((d) => (cost ? d : (({ cost, ...rest }) => rest)(d))),
      lines: this.all(
        "SELECT l.*,l.product_name AS name,l.product_barcode AS barcode FROM lines l",
      ).map((l) => (cost ? l : (({ cost, ...rest }) => rest)(l))),
      movements: cost
        ? this.all(
            "SELECT m.*,p.name FROM movements m JOIN products p ON p.id=m.product ORDER BY created DESC LIMIT 300",
          )
        : [],
      payments: cost
        ? this.all("SELECT * FROM payments ORDER BY created DESC LIMIT 500")
        : [],
      audit:
        this.session!.role === "manager"
          ? this.all("SELECT * FROM audit ORDER BY created DESC LIMIT 100")
          : [],
      holds: this.all(
        "SELECT * FROM holds WHERE actor=?",
        this.session!.id,
      ).map((h) => ({ ...h, cart: JSON.parse(h.cart) })),
    };
  }
  report(from: string, to: string) {
    const args = [from + "T00:00:00.000Z", to + "T23:59:59.999Z"];
    if (args[0] > args[1]) throw new Error("فترة غير صالحة");
    return {
      summary: this.one(
        "SELECT COALESCE(SUM(CASE WHEN kind='sale' THEN total WHEN kind='sale-return' THEN -total ELSE 0 END),0) sales,COALESCE(SUM(CASE WHEN kind='sale' THEN cost WHEN kind='sale-return' THEN -cost ELSE 0 END),0) cost,COALESCE(SUM(CASE WHEN kind='sale-return' THEN total ELSE 0 END),0) returns FROM documents WHERE created BETWEEN ? AND ?",
        ...args,
      ),
      byProduct: this.all(
        "SELECT p.name,SUM(CASE WHEN d.kind='sale' THEN l.quantity ELSE -l.quantity END) quantity,SUM(CASE WHEN d.kind='sale' THEN l.net ELSE -l.net END) net,SUM(CASE WHEN d.kind='sale' THEN l.cost ELSE -l.cost END) cost FROM lines l JOIN documents d ON d.id=l.document JOIN products p ON p.id=l.product WHERE d.kind IN ('sale','sale-return') AND d.created BETWEEN ? AND ? GROUP BY p.id",
        ...args,
      ),
      byUser: this.all(
        "SELECT u.username,SUM(CASE WHEN d.kind='sale' THEN d.total ELSE -d.total END) net FROM documents d JOIN users u ON u.id=d.actor WHERE d.kind IN ('sale','sale-return') AND d.created BETWEEN ? AND ? GROUP BY u.id",
        ...args,
      ),
      debts: this.all("SELECT * FROM parties").map((p) => ({
        ...p,
        balance: this.balance(p.id),
      })),
      lowStock: this.all(
        "SELECT id,name,quantity,reorder FROM products WHERE quantity<=reorder",
      ),
    };
  }
  async backup(target: string) {
    this.auth("backup", false);
    await sqliteBackup(this.db, target);
    this.audit("backup", "schema-2");
    return { schema: 2 };
  }
  async restore(
    source: string,
    safety: string,
    password: string,
    reason: string,
  ) {
    this.auth("restore", false);
    await this.confirm(password);
    if (this.busy) throw new Error("عملية أخرى قيد التنفيذ");
    this.busy = true;
    const stage = this.path + ".restore-stage";
    let closed = false;
    const fs = await import("node:fs/promises");
    try {
      const candidate = new DatabaseSync(source, { readOnly: true });
      try {
        if (
          candidate.prepare("PRAGMA integrity_check").get()!.integrity_check !==
            "ok" ||
          candidate.prepare("PRAGMA user_version").get()!.user_version !== 2
        )
          throw new Error("نسخة تالفة أو غير متوافقة");
        if (candidate.prepare("PRAGMA foreign_key_check").all().length)
          throw new Error("علاقات غير صالحة");
        const definitions = (db: DatabaseSync) =>
          JSON.stringify(
            db
              .prepare(
                "SELECT type,name,sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' ORDER BY type,name",
              )
              .all(),
          );
        if (definitions(candidate) !== definitions(this.db))
          throw new Error("مخطط النسخة لا يطابق البرنامج");
        await sqliteBackup(candidate, stage);
      } finally {
        candidate.close();
      }
      await sqliteBackup(this.db, safety);
      this.db.close();
      closed = true;
      try {
        for (const suffix of ["-wal", "-shm"])
          await fs.rm(this.path + suffix, { force: true });
        await fs.copyFile(stage, this.path);
      } catch (e) {
        await fs.copyFile(safety, this.path);
        throw e;
      } finally {
        this.db = new DatabaseSync(this.path);
        this.db.exec("PRAGMA foreign_keys=ON;PRAGMA journal_mode=WAL;");
        closed = false;
      }
      this.audit("restore", reason);
      this.session = undefined;
    } finally {
      if (closed) {
        this.db = new DatabaseSync(this.path);
        this.db.exec("PRAGMA foreign_keys=ON;PRAGMA journal_mode=WAL;");
      }
      await fs.rm(stage, { force: true });
      this.busy = false;
    }
    return { safety };
  }
  close() {
    this.db.close();
  }
}
