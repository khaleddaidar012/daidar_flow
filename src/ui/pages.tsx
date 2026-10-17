import { ProductForm } from "./product-form";
import React, { useState } from "react";
import { decimal } from "../core/money";
import { Form, Table, Card, money, quantity, type Props } from "./common";
export function Products({ data, action, busy, t }: Props) {
  const [preview, setPreview] = useState<any>(),
    [edit, setEdit] = useState<any>();
  return (
    <>
      <h1>{t("المنتجات والعبوات", "Products & packs")}</h1>
      {data.users.length > 0 && (
        <button
          disabled={busy}
          onClick={() => action("productExport").catch(() => undefined)}
        >
          {t("تصدير المنتجات", "Export products")}
        </button>
      )}
      <ProductForm action={action} busy={busy} t={t} />
      <details className="panel import-tools">
        <summary>
          {t("استيراد منتجات من ملف", "Import products from file")}
        </summary>
        <button
          disabled={busy}
          onClick={() =>
            action("importPreview")
              .then(setPreview)
              .catch(() => undefined)
          }
        >
          {t("اختيار ملف ومعاينة", "Choose file & preview")}
        </button>
        {preview && !preview.cancelled && (
          <>
            <p>
              {preview.total} {t("صف", "rows")} · {preview.errors.length}{" "}
              {t("خطأ", "errors")}
            </p>
            <pre>
              {JSON.stringify(
                preview.errors.length ? preview.errors : preview.rows,
                null,
                2,
              )}
            </pre>
            <button
              disabled={busy || preview.errors.length > 0}
              onClick={() =>
                action("importCommit")
                  .then(() => setPreview(undefined))
                  .catch(() => undefined)
              }
            >
              {t("اعتماد الاستيراد", "Commit import")}
            </button>
          </>
        )}
      </details>
      <Table
        columns={[
          t("الاسم", "Name"),
          "Barcode",
          t("الرصيد", "Stock"),
          t("سعر بيع", "Retail"),
          t("العبوة", "Pack"),
          t("إعداد", "Edit"),
        ]}
        rows={data.products.map((p: any) => [
          p.name,
          p.barcode,
          quantity(p.quantity),
          money(p.retail),
          p.pack_name + " × " + quantity(p.pack_factor),
          data.users.length > 0 ? (
            <button onClick={() => setEdit(p)}>
              {t("تعديل المنتج", "Edit product")}
            </button>
          ) : (
            "—"
          ),
        ])}
      />
      {edit && (
        <section className="panel">
          <h2>
            {t(
              "تعديل المنتج والأسعار — المستندات السابقة لا تتغير",
              "Edit product & pricing — existing documents retained",
            )}
          </h2>
          <Form
            key={edit.id}
            busy={busy}
            submit={t("حفظ", "Save")}
            fields={[
              ["name", t("الاسم", "Name"), "text", edit.name],
              [
                "barcode",
                t(
                  "الباركود — امسح الكود الفعلي هنا",
                  "Barcode — scan the actual code here",
                ),
                "text",
                edit.barcode,
              ],
              ["category", t("التصنيف", "Category"), "text", edit.category],
              ["retail", t("تجزئة", "Retail"), "number", money(edit.retail)],
              [
                "wholesale",
                t("جملة", "Wholesale"),
                "number",
                money(edit.wholesale),
              ],
              [
                "purchase",
                t("شراء", "Purchase"),
                "number",
                money(edit.purchase),
              ],
              [
                "reorder",
                t("حد الطلب", "Reorder"),
                "number",
                quantity(edit.reorder),
              ],
            ]}
            onSubmit={async (v) => {
              await action("productUpdate", {
                ...v,
                id: edit.id,
                retail: decimal(v.retail),
                wholesale: decimal(v.wholesale),
                purchase: decimal(v.purchase),
                reorder: decimal(v.reorder, 3),
              });
              setEdit(undefined);
            }}
          />
        </section>
      )}
    </>
  );
}
export function Inventory({ data, action, busy, t }: Props) {
  return (
    <>
      <h1>{t("الجرد وتسوية المخزون", "Stock count & adjustment")}</h1>
      <p>
        {t(
          "المخزون السالب ممنوع. الزيادة تُقيّم بمتوسط التكلفة الحالي أو تكلفة الشراء المحددة.",
          "Negative stock is blocked. Positive adjustments use current weighted cost or configured purchase cost.",
        )}
      </p>
      <Form
        busy={busy}
        submit={t("اعتماد جرد وتسوية", "Post counted stock")}
        fields={[
          [
            "productId",
            t("المنتج", "Product"),
            "select",
            data.products.map((p: any) => [p.id, p.name]),
          ],
          [
            "counted",
            t("الكمية الفعلية بالوحدة الأساسية", "Actual base quantity"),
            "number",
          ],
          ["reason", t("سبب التسوية", "Adjustment reason"), "text"],
        ]}
        onSubmit={(v) =>
          action("adjust", { ...v, counted: decimal(v.counted, 3) })
        }
      />
      <Table
        columns={[
          t("الصنف", "Product"),
          t("الكمية", "Quantity"),
          t("القيمة", "Value"),
          t("السبب", "Reason"),
          t("التاريخ", "Date"),
        ]}
        rows={data.movements.map((m: any) => [
          m.name,
          quantity(m.quantity),
          money(m.value),
          m.reason,
          new Date(m.created).toLocaleString(),
        ])}
      />
    </>
  );
}
export function Documents({ data, action, busy, t }: Props) {
  const [id, setId] = useState(""),
    [reason, setReason] = useState(""),
    [method, setMethod] = useState("cash"),
    [returns, setReturns] = useState<Record<string, string>>({}),
    [local, setLocal] = useState("");
  const doc = data.documents.find((d: any) => d.id === id),
    lines = data.lines.filter((l: any) => l.document === id);
  return (
    <>
      <h1>{t("الفواتير والمرتجعات", "Documents & returns")}</h1>
      <Table
        columns={[
          "ID",
          t("النوع", "Kind"),
          t("الإجمالي", "Total"),
          t("عرض", "Open"),
        ]}
        rows={data.documents.map((d: any) => [
          d.id.slice(0, 8),
          d.kind,
          money(d.total),
          <button
            onClick={() => {
              setId(d.id);
              setReturns({});
            }}
          >
            {t("فتح", "Open")}
          </button>,
        ])}
      />
      {doc && (
        <section className="panel">
          <h2>
            {doc.kind} · {doc.id}
          </h2>
          <Table
            columns={[
              t("الصنف", "Product"),
              t("كمية أساسية", "Base quantity"),
              t("قيمة السطر", "Line value"),
              t("الكمية المرتجعة", "Return quantity"),
            ]}
            rows={lines.map((l: any) => [
              l.name,
              quantity(l.quantity),
              money(l.net),
              <input
                aria-label={t("كمية مرتجع", "Return quantity")}
                type="number"
                min="0"
                max={l.quantity / 1000}
                step="0.001"
                value={returns[l.id] || "0"}
                onChange={(e) =>
                  setReturns({ ...returns, [l.id]: e.target.value })
                }
              />,
            ])}
          />
          <label>
            {t("سبب المرتجع أو إعادة الطباعة", "Return or reprint reason")}
            <input value={reason} onChange={(e) => setReason(e.target.value)} />
          </label>
          {local && <p className="error">{local}</p>}
          <div className="row">
            <button
              disabled={busy}
              onClick={() =>
                action("print", { documentId: id, reason }).catch(
                  () => undefined,
                )
              }
            >
              {t("طباعة / إعادة طباعة", "Print / reprint")}
            </button>
            {["sale", "purchase"].includes(doc.kind) && (
              <>
                <select
                  value={method}
                  onChange={(e) => setMethod(e.target.value)}
                >
                  <option value="cash">{t("رد نقدي", "Cash refund")}</option>
                  <option value="card">{t("رد بطاقة", "Card refund")}</option>
                  <option value="other">{t("وسيلة أخرى", "Other")}</option>
                  <option value="credit">
                    {t("تخفيض المديونية فقط", "Debt reduction only")}
                  </option>
                </select>
                <button
                  disabled={busy}
                  onClick={async () => {
                    try {
                      setLocal("");
                      const selected = Object.entries(returns)
                        .filter(([, q]) => decimal(q, 3) > 0)
                        .map(([lineId, q]) => ({
                          lineId,
                          quantity: decimal(q, 3),
                        }));
                      await action("return", {
                        documentId: id,
                        lines: selected,
                        reason,
                        method,
                      });
                      setReturns({});
                    } catch (e) {
                      setLocal(String(e));
                    }
                  }}
                >
                  {t("اعتماد مرتجع مرتبط", "Post linked return")}
                </button>
              </>
            )}
          </div>
        </section>
      )}
    </>
  );
}
export function Shifts({
  data,
  action,
  busy,
  t,
  manager,
}: Props & { manager: boolean }) {
  return (
    <>
      <h1>{t("الوردية والنقدية", "Shift & cash")}</h1>
      {data.currentShift ? (
        <>
          <div className="cards">
            <Card
              title={t("العهدة", "Opening float")}
              value={money(data.currentShift.float)}
            />
            <Card
              title={t("النقد المتوقع", "Expected cash")}
              value={money(data.currentShift.expected)}
            />
          </div>
          <Form
            busy={busy}
            submit={t("إغلاق الوردية", "Close shift")}
            fields={[
              ["actual", t("النقد الفعلي", "Actual counted cash"), "number"],
              [
                "reason",
                t("سبب الفرق إن وجد", "Difference reason if any"),
                "text",
                "",
                false,
              ],
            ]}
            onSubmit={(v) =>
              action("shiftClose", { ...v, actual: decimal(v.actual) })
            }
          />
          {manager && (
            <Form
              busy={busy}
              submit={t("حركة نقدية", "Cash event")}
              fields={[
                [
                  "kind",
                  t("النوع", "Kind"),
                  "select",
                  [
                    ["deposit", t("إيداع", "Deposit")],
                    ["withdrawal", t("سحب", "Withdrawal")],
                    ["expense", t("مصروف", "Expense")],
                  ],
                ],
                ["amount", t("المبلغ", "Amount"), "number"],
                ["reason", t("السبب", "Reason"), "text"],
              ]}
              onSubmit={(v) =>
                action("cash", { ...v, amount: decimal(v.amount) })
              }
            />
          )}
        </>
      ) : (
        <Form
          busy={busy}
          submit={t("فتح وردية", "Open shift")}
          fields={[
            ["float", t("عهدة البداية", "Opening float"), "number", "0"],
          ]}
          onSubmit={(v) => action("shiftOpen", { float: decimal(v.float) })}
        />
      )}
      <Table
        columns={[
          t("فتح", "Opened"),
          t("إغلاق", "Closed"),
          t("المتوقع", "Expected"),
          t("الفعلي", "Actual"),
          t("الفرق", "Difference"),
          t("السبب", "Reason"),
        ]}
        rows={data.shifts.map((s: any) => [
          s.opened,
          s.closed || "—",
          s.expected === null ? "—" : money(s.expected),
          s.actual === null ? "—" : money(s.actual),
          s.difference === null ? "—" : money(s.difference),
          s.reason || "—",
        ])}
      />
    </>
  );
}
export function Parties({ data, action, busy, t }: Props) {
  const [selected, setSelected] = useState("");
  return (
    <>
      <h1>{t("العملاء والموردون", "Customers & suppliers")}</h1>
      <Form
        busy={busy}
        submit={t("إضافة طرف", "Add party")}
        fields={[
          ["name", t("الاسم", "Name"), "text"],
          [
            "kind",
            t("النوع", "Kind"),
            "select",
            [
              ["customer", t("عميل", "Customer")],
              ["supplier", t("مورد", "Supplier")],
            ],
          ],
          [
            "opening",
            t("مديونية افتتاحية", "Opening amount due"),
            "number",
            "0",
          ],
          [
            "creditLimit",
            t("حد ائتمان، 0 لتعطيله", "Credit limit, 0 disables"),
            "number",
            "0",
          ],
          [
            "reason",
            t("سبب الرصيد الافتتاحي", "Opening balance reason"),
            "text",
          ],
        ]}
        onSubmit={(v) =>
          action("partyCreate", {
            ...v,
            opening: decimal(v.opening),
            creditLimit: decimal(v.creditLimit),
          })
        }
      />
      <Table
        columns={[
          t("الاسم", "Name"),
          t("النوع", "Kind"),
          t("المديونية", "Due"),
          t("كشف", "Statement"),
        ]}
        rows={data.parties.map((p: any) => [
          p.name,
          p.kind,
          money(p.balance),
          <button onClick={() => setSelected(p.id)}>{t("فتح", "Open")}</button>,
        ])}
      />
      <h2>{t("تسجيل دفعة", "Record payment")}</h2>
      <Form
        busy={busy}
        submit={t("اعتماد دفعة", "Post payment")}
        fields={[
          [
            "partyId",
            t("الطرف", "Party"),
            "select",
            data.parties.map((p: any) => [p.id, p.name]),
          ],
          ["amount", t("المبلغ", "Amount"), "number"],
          [
            "method",
            t("الوسيلة", "Method"),
            "select",
            [
              ["cash", t("نقدي", "Cash")],
              ["card", t("بطاقة", "Card")],
              ["other", t("أخرى", "Other")],
            ],
          ],
          ["reason", t("السبب", "Reason"), "text"],
        ]}
        onSubmit={(v) =>
          action("partyPay", { ...v, amount: decimal(v.amount) })
        }
      />
      {selected && (
        <>
          <h2>{t("كشف الطرف", "Party statement")}</h2>
          <p>
            {t("الرصيد الافتتاحي", "Opening")}:{" "}
            {money(data.parties.find((p: any) => p.id === selected)?.opening)}
          </p>
          <Table
            columns={[
              "ID",
              t("النوع", "Kind"),
              t("القيمة", "Value"),
              t("التاريخ", "Date"),
            ]}
            rows={[
              ...data.documents
                .filter((d: any) => d.party === selected)
                .map((d: any) => [
                  d.id.slice(0, 8),
                  d.kind,
                  money(d.total),
                  d.created,
                ]),
              ...(data.payments || [])
                .filter((p: any) => p.party === selected)
                .map((p: any) => [
                  p.id.slice(0, 8),
                  p.method,
                  money(p.amount),
                  p.created,
                ]),
            ]}
          />
        </>
      )}
    </>
  );
}
export function Reports({ action, busy, t }: Props) {
  const today = new Date().toISOString().slice(0, 10),
    [report, setReport] = useState<any>();
  return (
    <>
      <h1>{t("التقارير", "Reports")}</h1>
      <Form
        busy={busy}
        submit={t("عرض التقرير", "Show report")}
        fields={[
          ["from", t("من UTC", "From UTC"), "date", today],
          ["to", t("إلى UTC", "To UTC"), "date", today],
        ]}
        onSubmit={async (v) => setReport(await action("report", v))}
      />
      {report?.hasZeroCostOpening && (
        <p className="status">
          {t(
            "يوجد رصيد افتتاحي مسجل بتكلفة صفر. قد يكون الربح المعروض أعلى من الربح الفعلي حتى مراجعة تقييم هذا الرصيد.",
            "Opening stock was recorded at zero cost. Reported profit may exceed actual profit until this valuation is reviewed.",
          )}
        </p>
      )}
      {report && (
        <>
          <div className="cards">
            <Card
              title={t("المبيعات بعد المرتجعات", "Sales after returns")}
              value={money(report.summary.sales)}
            />
            <Card
              title={t("تكلفة المبيعات", "Cost of sales")}
              value={money(report.summary.cost)}
            />
            <Card
              title={t("الربح الإجمالي", "Gross profit")}
              value={money(report.summary.sales - report.summary.cost)}
            />
            <Card
              title={t("المرتجعات", "Returns")}
              value={money(report.summary.returns)}
            />
          </div>
          <h2>{t("حسب الصنف", "By product")}</h2>
          <Table
            columns={[
              t("الصنف", "Product"),
              t("الكمية", "Quantity"),
              t("المبيعات", "Sales"),
              t("التكلفة", "Cost"),
            ]}
            rows={report.byProduct.map((p: any) => [
              p.name,
              quantity(p.quantity),
              money(p.net),
              money(p.cost),
            ])}
          />
          <h2>{t("حسب المستخدم", "By user")}</h2>
          <Table
            columns={[t("المستخدم", "User"), t("المبيعات", "Sales")]}
            rows={report.byUser.map((p: any) => [p.username, money(p.net)])}
          />
          <h2>{t("النواقص", "Low stock")}</h2>
          <Table
            columns={[t("الصنف", "Product"), t("الكمية", "Quantity")]}
            rows={report.lowStock.map((p: any) => [
              p.name,
              quantity(p.quantity),
            ])}
          />
          <h2>{t("المديونيات", "Balances due")}</h2>
          <Table
            columns={[t("الطرف", "Party"), t("المديونية", "Due")]}
            rows={report.debts.map((p: any) => [p.name, money(p.balance)])}
          />
        </>
      )}
    </>
  );
}
export function Users({
  data,
  action,
  busy,
  t,
  session,
}: Props & { session: any }) {
  return (
    <>
      <h1>{t("المستخدمون المحليون", "Local users")}</h1>
      <p>
        {t(
          "الكلمة مؤقتة وتفرض التغيير أول دخول. سلّمها شخصيًا، لا عبر واتساب أو بريد.",
          "Temporary passwords require a change on first sign in. Hand them over in person.",
        )}
      </p>
      <Form
        busy={busy}
        submit={t("إنشاء موظف", "Create employee")}
        fields={[
          ["username", t("اسم المستخدم", "Username"), "text"],
          [
            "password",
            t("كلمة مؤقتة (10 أحرف)", "Temporary password (10 chars)"),
            "password",
          ],
          [
            "role",
            t("الدور", "Role"),
            "select",
            [
              ["cashier", t("كاشير", "Cashier")],
              ["stock", t("مخزن", "Stock")],
              ["manager", t("مدير", "Manager")],
            ],
          ],
        ]}
        onSubmit={(v) => action("userCreate", v)}
      />
      <Table
        columns={[
          t("اسم المستخدم", "Username"),
          t("الدور", "Role"),
          t("تغيير مطلوب", "Change required"),
        ]}
        rows={data.users.map((u: any) => [
          u.username,
          u.role,
          u.must_change ? "✓" : "—",
        ])}
      />
      <h2>{t("إعادة تعيين كلمة موظف", "Reset employee password")}</h2>
      <Form
        busy={busy}
        submit={t("إعادة تعيين", "Reset")}
        fields={[
          [
            "userId",
            t("الموظف", "User"),
            "select",
            data.users
              .filter((u: any) => u.id !== session.id)
              .map((u: any) => [u.id, u.username]),
          ],
          [
            "password",
            t("كلمة مؤقتة جديدة", "New temporary password"),
            "password",
          ],
          [
            "managerPassword",
            t("تأكيد بكلمة المدير", "Manager password confirmation"),
            "password",
          ],
        ]}
        onSubmit={(v) => action("userReset", v)}
      />
    </>
  );
}
