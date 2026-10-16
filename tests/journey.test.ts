import { schema } from "../src/core/schema";
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { generateKeyPairSync, randomUUID, sign } from "node:crypto";
import { License, type Claims, type Envelope } from "../src/core/license";
import { Store } from "../src/core/store";
import { decimal, ratio } from "../src/core/money";
function fixture() {
  const dir = mkdtempSync(join(tmpdir(), "flow-test-"));
  let time = Date.parse("2026-10-15T12:00:00Z");
  const device = randomUUID();
  const keys = generateKeyPairSync("ed25519");
  let saved: any = {};
  const license = new License(
    device,
    {
      "test-1": keys.publicKey
        .export({ type: "spki", format: "pem" })
        .toString(),
    },
    {
      load: () => saved,
      save: (s) => {
        saved = s;
      },
    },
    () => time,
  );
  const claims: Claims = {
    kid: "test-1",
    version: 1,
    product: "daidar-flow",
    device,
    subscription: "test-subscription",
    business: "test-business",
    modules: ["general"],
    issuedAt: new Date(time).toISOString(),
    expiresAt: new Date(time + 30 * 86400000).toISOString(),
    offlineUntil: new Date(time + 30 * 86400000).toISOString(),
    graceSeconds: 0,
  };
  const envelope = (c: Claims): Envelope => {
    const bytes = Buffer.from(JSON.stringify(c));
    return {
      payload: bytes.toString("base64url"),
      signature: sign(null, bytes, keys.privateKey).toString("base64url"),
    };
  };
  const store = new Store(join(dir, "flow.sqlite"), license, () => time);
  return {
    dir,
    store,
    license,
    claims,
    envelope,
    advance: (n: number) => {
      time += n;
    },
    cleanup: () => {
      store.close();
      rmSync(dir, { recursive: true, force: true });
    },
  };
}
const product = {
  name: "اختبار قطع",
  barcode: "622001",
  category: "عام",
  baseUnit: "قطعة",
  packName: "كرتونة",
  packFactor: 12000,
  retail: 2000,
  wholesale: 1500,
  purchase: 1000,
  reorder: 2000,
};
async function manager(f: ReturnType<typeof fixture>) {
  f.license.accept(f.envelope(f.claims));
  await f.store.execute("setup", {
    business: "متجر اختبار",
    username: "admin",
    password: "manager-password-42",
  });
  await f.store.execute("login", {
    username: "admin",
    password: "manager-password-42",
  });
}
test("full general-store journey, costs, split tender, partial return, cash and restore", async () => {
  const f = fixture(),
    s = f.store;
  try {
    await manager(f);
    const employee = await s.execute("userCreate", {
      username: "cashier",
      password: "temporary-password",
      role: "cashier",
    });
    const item = await s.execute("productCreate", product);
    const supplier = await s.execute("partyCreate", {
      name: "مورد اختبار",
      kind: "supplier",
      opening: 0,
      reason: "افتتاح جديد",
      creditLimit: 0,
    });
    await s.execute("purchase", {
      operationId: randomUUID(),
      partyId: supplier.id,
      lines: [
        { productId: item.id, unit: "pack", quantity: 1000, price: 12000 },
      ],
      payments: [],
    });
    assert.equal(s.product(item.id).quantity, 12000);
    assert.equal(s.product(item.id).value, 12000);
    await s.execute("shiftOpen", { operationId: randomUUID(), float: 10000 });
    const first = await s.execute("sale", {
      operationId: randomUUID(),
      lines: [
        { productId: item.id, unit: "base", quantity: 2000, price: 1500 },
      ],
      discount: 0,
      payments: [{ method: "cash", amount: 3000 }],
    });
    assert.equal(first.cost, 2000);
    assert.equal(first.grossProfit, 1000);
    await s.execute("purchase", {
      operationId: randomUUID(),
      partyId: supplier.id,
      lines: [
        { productId: item.id, unit: "base", quantity: 10000, price: 2000 },
      ],
      payments: [],
    });
    assert.equal(s.product(item.id).value, 30000);
    assert.equal(s.product(item.id).quantity, 20000);
    const input = {
      operationId: randomUUID(),
      lines: [
        { productId: item.id, unit: "base", quantity: 5000, price: 2000 },
      ],
      discount: 1000,
      payments: [
        { method: "cash", amount: 4000 },
        { method: "card", amount: 5000 },
      ],
    };
    const sale = await s.execute("sale", input);
    assert.equal(sale.cost, 7500);
    assert.equal(sale.total, 9000);
    assert.deepEqual(await s.execute("sale", input), sale);
    assert.equal(s.all("SELECT id FROM documents WHERE kind='sale'").length, 2);
    await assert.rejects(
      s.execute("sale", { ...input, discount: 0 }),
      /معرف العملية/,
    );
    const line = s.one("SELECT * FROM lines WHERE document=?", sale.id)!;
    const ret = await s.execute("return", {
      operationId: randomUUID(),
      documentId: sale.id,
      lines: [{ lineId: line.id, quantity: 2000 }],
      method: "cash",
      reason: "مرتجع اختبار جزئي",
    });
    assert.equal(ret.total, 3600);
    assert.equal(ret.cost, 3000);
    assert.equal(s.product(item.id).quantity, 17000);
    assert.equal(s.product(item.id).value, 25500);
    const before = s.product(item.id);
    await assert.rejects(
      s.execute("sale", {
        ...input,
        operationId: randomUUID(),
        lines: [
          { productId: item.id, unit: "base", quantity: 999000, price: 2000 },
        ],
      }),
      /المخزون/,
    );
    assert.deepEqual(s.product(item.id), before);
    await assert.rejects(
      s.execute("return", {
        operationId: randomUUID(),
        documentId: sale.id,
        lines: [{ lineId: line.id, quantity: 4000 }],
        method: "cash",
        reason: "تجاوز المرتجع",
      }),
      /أكبر/,
    );
    await s.execute("adjust", {
      operationId: randomUUID(),
      productId: item.id,
      counted: 16000,
      reason: "فرق جرد اختبار",
    });
    assert.equal(s.product(item.id).value, 24000);
    assert.equal(s.balance(supplier.id), 32000);
    const report = await s.execute("report", {
      from: "2026-10-15",
      to: "2026-10-15",
    });
    assert.equal(report.summary.sales - report.summary.cost, 1900);
    const close = await s.execute("shiftClose", {
      operationId: randomUUID(),
      actual: 13400,
      reason: "",
    });
    assert.equal(close.expected, 13400);
    assert.equal(close.difference, 0);
    await s.backup(join(f.dir, "backup.sqlite"));
    await s.execute("adjust", {
      operationId: randomUUID(),
      productId: item.id,
      counted: 15000,
      reason: "تغيير بعد النسخ",
    });
    await s.restore(
      join(f.dir, "backup.sqlite"),
      join(f.dir, "safety.sqlite"),
      "manager-password-42",
      "استعادة اختبار",
    );
    assert.equal(s.product(item.id).quantity, 16000);
    assert.equal(s.session, undefined);
    // Fresh installation opens backup without its old license or machine identity.
    const second = new Store(join(f.dir, "backup.sqlite"), f.license);
    assert.equal(second.product(item.id).quantity, 16000);
    second.close();
    await s.execute("login", {
      username: "admin",
      password: "manager-password-42",
    });
    await s.execute("logout", {});
    await s.execute("login", {
      username: "cashier",
      password: "temporary-password",
    });
    await assert.rejects(s.execute("snapshot", {}), /غيّر/);
    await s.execute("password", {
      oldPassword: "temporary-password",
      newPassword: "employee-new-password",
    });
    await assert.rejects(
      s.execute("adjust", {
        operationId: randomUUID(),
        productId: item.id,
        counted: 1,
        reason: "ليس مسموحا",
      }),
      /غير مسموح/,
    );
    await assert.rejects(
      s.execute("userCreate", {
        username: "blocked",
        password: "temporary-password",
        role: "manager",
      }),
      /غير مسموح/,
    );
    assert.equal(
      s
        .one("SELECT hash FROM users WHERE id=?", employee.id)!
        .hash.startsWith("$argon2id$"),
      true,
    );
  } finally {
    f.cleanup();
  }
});
test("signed licenses reject tampering, other device and rollback; renewal and expiry preserve reads", async () => {
  const f = fixture();
  try {
    await manager(f);
    const valid = f.envelope(f.claims);
    assert.throws(
      () =>
        f.license.accept({
          ...valid,
          signature: Buffer.alloc(64).toString("base64url"),
        }),
      /توقيع/,
    );
    assert.throws(
      () => f.license.accept(f.envelope({ ...f.claims, device: randomUUID() })),
      /جهاز/,
    );
    assert.throws(
      () =>
        f.license.accept(
          f.envelope({
            ...f.claims,
            version: 1,
            expiresAt: new Date(
              Date.parse(f.claims.expiresAt) + 1000,
            ).toISOString(),
          }),
        ),
      /متعارضة/,
    );
    const newClaims = {
      ...f.claims,
      version: 2,
      expiresAt: "2026-12-15T12:00:00.000Z",
      offlineUntil: "2026-12-15T12:00:00.000Z",
    };
    f.license.accept(f.envelope(newClaims));
    assert.equal(f.license.status().claims!.version, 2);
    f.license.accept(f.envelope(newClaims));
    assert.equal(f.license.status().claims!.expiresAt, newClaims.expiresAt);
    assert.throws(() => f.license.accept(valid), /قديمة/);
    f.advance(-86400000);
    assert.equal(f.license.status().clockWarning, true);
    assert.equal(f.license.status().active, true);
    f.advance(100 * 86400000);
    assert.equal(f.license.status().active, false);
    await assert.rejects(f.store.execute("productCreate", product), /انتهت/);
    assert.ok(await f.store.execute("snapshot", {}));
    await f.store.backup(join(f.dir, "expired.sqlite"));
  } finally {
    f.cleanup();
  }
});
test("role checks, cash lockout, exact quantities, immutable documents, persistence after upgrade/reopen", async () => {
  const f = fixture();
  try {
    await manager(f);
    const s = f.store;
    const p = await s.execute("productCreate", product);
    const supp = await s.execute("partyCreate", {
      name: "test",
      kind: "supplier",
      opening: 0,
      creditLimit: 0,
      reason: "opening",
    });
    await s.execute("purchase", {
      operationId: randomUUID(),
      partyId: supp.id,
      lines: [{ productId: p.id, quantity: 1500, unit: "base", price: 1000 }],
      payments: [],
    });
    await s.execute("shiftOpen", { operationId: randomUUID(), float: 0 });
    const sale = await s.execute("sale", {
      operationId: randomUUID(),
      lines: [{ productId: p.id, quantity: 1250, unit: "base", price: 2000 }],
      payments: [{ method: "cash", amount: 2500 }],
      discount: 0,
    });
    assert.equal(sale.cost, 1250);
    assert.throws(
      () => s.run("DELETE FROM documents WHERE id=?", sale.id),
      /immutable/,
    );
    await assert.rejects(
      s.execute("shiftClose", {
        operationId: randomUUID(),
        actual: 0,
        reason: "",
      }),
      /سبب/,
    );
    await s.execute("logout", {});
    for (let i = 0; i < 5; i++)
      await assert.rejects(
        s.execute("login", { username: "admin", password: "wrong" }),
      );
    await assert.rejects(
      s.execute("login", {
        username: "admin",
        password: "manager-password-42",
      }),
      /مقفول/,
    );
    f.advance(901000);
    await s.execute("login", {
      username: "admin",
      password: "manager-password-42",
    });
    s.close();
    s.db = new (await import("node:sqlite")).DatabaseSync(s.path);
    s.db.exec("PRAGMA foreign_keys=ON;");
    assert.equal(s.product(p.id).quantity, 250);
    assert.equal(s.one("PRAGMA user_version")!.user_version, 2);
  } finally {
    f.cleanup();
  }
});
test("exact decimal conversion and rounded allocation", () => {
  assert.equal(decimal("12.34"), 1234);
  assert.equal(decimal("0.125", 3), 125);
  assert.throws(() => decimal("1.234"));
  assert.equal(ratio(100, 1, 3), 33);
  assert.equal(ratio(100, 2, 3) - ratio(100, 1, 3), 34);
});

test("credit limit, allocated collections, purchase returns and refund by original document", async () => {
  const f = fixture();
  try {
    await manager(f);
    const s = f.store;
    const customer = await s.execute("partyCreate", {
      name: "عميل",
      kind: "customer",
      opening: 1000,
      creditLimit: 6000,
      reason: "رصيد موثق",
    });
    const supplier = await s.execute("partyCreate", {
      name: "مورد",
      kind: "supplier",
      opening: 0,
      creditLimit: 0,
      reason: "جديد",
    });
    const p = await s.execute("productCreate", product);
    const purchase = await s.execute("purchase", {
      operationId: randomUUID(),
      partyId: supplier.id,
      lines: [{ productId: p.id, quantity: 12000, unit: "base", price: 1000 }],
      payments: [],
    });
    await s.execute("shiftOpen", { operationId: randomUUID(), float: 10000 });
    const first = await s.execute("sale", {
      operationId: randomUUID(),
      partyId: customer.id,
      lines: [{ productId: p.id, quantity: 2000, unit: "base", price: 2000 }],
      discount: 0,
      payments: [],
    });
    assert.equal(s.balance(customer.id), 5000);
    await assert.rejects(
      s.execute("sale", {
        operationId: randomUUID(),
        partyId: customer.id,
        lines: [{ productId: p.id, quantity: 1000, unit: "base", price: 2000 }],
        discount: 0,
        payments: [],
      }),
      /الائتماني/,
    );
    const collection = await s.execute("partyPay", {
      operationId: randomUUID(),
      partyId: customer.id,
      amount: 5000,
      method: "cash",
      reason: "تحصيل موثق",
    });
    assert.equal(collection.allocations.length, 2);
    assert.equal(s.documentOutstanding(first.id), 0);
    assert.equal(s.balance(customer.id), 0);
    // Existing other debt must not consume a refund on the already-paid original invoice.
    await s.execute("sale", {
      operationId: randomUUID(),
      partyId: customer.id,
      lines: [{ productId: p.id, quantity: 1000, unit: "base", price: 2000 }],
      discount: 0,
      payments: [],
    });
    const line = s.one("SELECT id FROM lines WHERE document=?", first.id)!;
    const ret = await s.execute("return", {
      operationId: randomUUID(),
      documentId: first.id,
      lines: [{ lineId: line.id, quantity: 1000 }],
      method: "cash",
      reason: "مرتجع مدفوع",
    });
    assert.equal(ret.refund, 2000);
    assert.equal(s.balance(customer.id), 2000);
    const purchaseLine = s.one(
      "SELECT id FROM lines WHERE document=?",
      purchase.id,
    )!;
    const purchaseReturn = await s.execute("return", {
      operationId: randomUUID(),
      documentId: purchase.id,
      lines: [{ lineId: purchaseLine.id, quantity: 1000 }],
      method: "credit",
      reason: "رد مورد آجل",
    });
    assert.equal(purchaseReturn.refund, 0);
    assert.equal(purchaseReturn.credit, 1000);
    assert.equal(s.balance(supplier.id), 11000);
    assert.equal(
      s.all("SELECT * FROM movements WHERE reason='رد مورد آجل'").length,
      1,
    );
  } finally {
    f.cleanup();
  }
});
test("fractional repeated returns allocate cents exactly; inconsistent backup rejected", async () => {
  const f = fixture();
  try {
    await manager(f);
    const s = f.store,
      p = await s.execute("productCreate", {
        ...product,
        retail: 101,
        purchase: 100,
        wholesale: 101,
      });
    const supplier = await s.execute("partyCreate", {
      name: "مورد",
      kind: "supplier",
      opening: 0,
      creditLimit: 0,
      reason: "جديد",
    });
    await s.execute("purchase", {
      operationId: randomUUID(),
      partyId: supplier.id,
      lines: [{ productId: p.id, quantity: 3000, unit: "base", price: 100 }],
      payments: [],
    });
    await s.execute("shiftOpen", { operationId: randomUUID(), float: 1000 });
    const sale = await s.execute("sale", {
      operationId: randomUUID(),
      lines: [{ productId: p.id, quantity: 3000, unit: "base", price: 101 }],
      discount: 1,
      payments: [{ method: "cash", amount: 302 }],
    });
    const line = s.one("SELECT id FROM lines WHERE document=?", sale.id)!;
    let total = 0,
      cost = 0;
    for (let i = 0; i < 3; i++) {
      const ret = await s.execute("return", {
        operationId: randomUUID(),
        documentId: sale.id,
        lines: [{ lineId: line.id, quantity: 1000 }],
        method: "cash",
        reason: "تقريب تراكمي",
      });
      total += ret.total;
      cost += ret.cost;
    }
    assert.equal(total, 302);
    assert.equal(cost, 300);
    assert.equal(s.product(p.id).value, 300);
    assert.equal(s.expected(s.currentShift().id), 1000);
    const bad = join(f.dir, "bad.sqlite");
    await s.backup(bad);
    const { DatabaseSync } = await import("node:sqlite");
    const db = new DatabaseSync(bad);
    db.exec("CREATE TABLE extra (value TEXT)");
    db.close();
    await assert.rejects(
      s.restore(
        bad,
        join(f.dir, "safety.sqlite"),
        "manager-password-42",
        "نسخة غير معتمدة",
      ),
      /مخطط/,
    );
    assert.equal(s.product(p.id).quantity, 3000);
  } finally {
    f.cleanup();
  }
});

test("schema 1 migration backs up original and preserves document snapshots on product rename", async () => {
  const f = fixture();
  try {
    await manager(f);
    const s = f.store;
    const { DatabaseSync } = await import("node:sqlite");
    const path = join(f.dir, "legacy.sqlite"),
      db = new DatabaseSync(path);
    db.exec(schema);
    const user = s.one("SELECT * FROM users LIMIT 1")!;
    const item = randomUUID(),
      doc = randomUUID(),
      line = randomUUID();
    db.prepare("INSERT INTO users(id,username,hash,role) VALUES(?,?,?,?)").run(
      user.id,
      user.username,
      user.hash,
      "manager",
    );
    db.prepare(
      "INSERT INTO products(id,name,barcode,category,base_unit,pack_name,pack_factor,retail,wholesale,purchase,reorder,quantity,value) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)",
    ).run(
      item,
      "اسم الفاتورة الأصلي",
      "LEGACY",
      "عام",
      "قطعة",
      "كرتونة",
      12000,
      2000,
      1500,
      1000,
      1000,
      12000,
      12000,
    );
    db.prepare("INSERT INTO documents VALUES(?,?,?,?,?,?,?,?,?,?,?)").run(
      doc,
      "purchase",
      null,
      user.id,
      null,
      null,
      "2026-10-15T12:00:00.000Z",
      12000,
      12000,
      0,
      null,
    );
    db.prepare("INSERT INTO lines VALUES(?,?,?,?,?,?,?,?)").run(
      line,
      doc,
      item,
      12000,
      12000,
      12000,
      12000,
      null,
    );
    db.close();
    const upgraded = new Store(path, f.license);
    assert.equal(upgraded.one("PRAGMA user_version")!.user_version, 2);
    assert.equal(upgraded.product(item).quantity, 12000);
    assert.equal(
      upgraded.one("SELECT product_name FROM lines WHERE id=?", line)!
        .product_name,
      "اسم الفاتورة الأصلي",
    );
    const fs = await import("node:fs");
    const before = fs
      .readdirSync(f.dir)
      .find((n) => n.startsWith("legacy.sqlite.before-schema-2"));
    assert.ok(before);
    const backup = new DatabaseSync(join(f.dir, before), { readOnly: true });
    assert.equal(backup.prepare("PRAGMA user_version").get()!.user_version, 1);
    backup.close();
    await upgraded.execute("login", {
      username: "admin",
      password: "manager-password-42",
    });
    await upgraded.execute("productUpdate", {
      id: item,
      name: "اسم جديد",
      category: "عام",
      retail: 3000,
      wholesale: 2500,
      purchase: 1200,
      reorder: 1000,
    });
    assert.equal(upgraded.product(item).retail, 3000);
    assert.equal(
      (await upgraded.execute("snapshot", {})).lines[0].name,
      "اسم الفاتورة الأصلي",
    );
    upgraded.close();
  } finally {
    f.cleanup();
  }
});

test("full export retains older pages and excludes authentication secrets after expiry", async () => {
  const f = fixture();
  try {
    await manager(f);
    const s = f.store,
      actor = s.session!.id;
    s.transaction(() => {
      for (let i = 0; i < 550; i++)
        s.run(
          "INSERT INTO documents VALUES(?,?,?,?,?,?,?,?,?,?,?)",
          randomUUID(),
          "purchase",
          null,
          actor,
          null,
          null,
          "2026-10-15T12:00:00.000Z",
          0,
          0,
          0,
          null,
        );
    });
    assert.equal(s.snapshot().documents.length, 300);
    f.advance(31 * 86400000);
    const exported = s.exportData();
    assert.equal(exported.documents.length, 550);
    assert.equal(exported.users.length, 1);
    for (const user of exported.users) {
      assert.equal("hash" in user, false);
      assert.equal("password" in user, false);
    }
    assert.equal(JSON.stringify(exported).includes("$argon2"), false);
  } finally {
    f.cleanup();
  }
});
