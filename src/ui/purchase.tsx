import React, { useState } from "react";
import { decimal, ratio } from "../core/money";
import { money, quantity, type Props } from "./common";
import { ProductForm } from "./product-form";
export function Purchase({ data, action, busy, t }: Props) {
  const [supplier, setSupplier] = useState(""),
    [newSupplier, setNewSupplier] = useState(false),
    [newProduct, setNewProduct] = useState(false),
    [supplierName, setSupplierName] = useState(""),
    [rows, setRows] = useState<any[]>([
      {
        key: crypto.randomUUID(),
        productId: "",
        quantity: "1",
        unit: "base",
        totalCost: "",
      },
    ]),
    [paid, setPaid] = useState("0"),
    [method, setMethod] = useState("other"),
    [error, setError] = useState(""),
    [saved, setSaved] = useState<any>();
  const suppliers = data.parties.filter((p: any) => p.kind === "supplier");
  const selected = suppliers.find((p: any) => p.id === supplier);
  const edit = (i: number, k: string, v: string) =>
    setRows((r) => r.map((x, j) => (j === i ? { ...x, [k]: v } : x)));
  let total = 0,
    paidValue = 0;
  try {
    total = rows.reduce((s, r) => s + decimal(r.totalCost || "0"), 0);
    paidValue = decimal(paid || "0");
  } catch {}
  const baseQuantity = (r: any) => {
    const p = data.products.find((p: any) => p.id === r.productId);
    return r.unit === "pack"
      ? ratio(decimal(r.quantity, 3), p?.pack_factor || 12000, 1000)
      : decimal(r.quantity, 3);
  };
  return (
    <>
      <div className="page-heading">
        <div>
          <h1>{t("المشتريات", "Purchases")}</h1>
          <p>
            {t(
              "سجّل اللي اشتريته، إجمالي تكلفته والمدفوع. المخزون وحساب المورد يتحدّثان مع اعتماد الفاتورة.",
              "Record what you bought, its total cost and the payment. Posting updates stock and supplier balance.",
            )}
          </p>
        </div>
      </div>
      <section className="panel supplier-panel">
        <div className="section-heading">
          <h2>{t("١. المورد", "1. Supplier")}</h2>
          <button type="button" onClick={() => setNewSupplier(!newSupplier)}>
            {t("+ مورد جديد", "+ New supplier")}
          </button>
        </div>
        <label>
          {t("اختر المورد", "Choose supplier")}
          <select
            value={supplier}
            onChange={(e) => setSupplier(e.target.value)}
          >
            <option value="">
              {t("اختر اسم المورد…", "Select supplier…")}
            </option>
            {suppliers.map((p: any) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
        {selected && (
          <p className="muted">
            {t("المستحق للمورد حاليًا", "Current balance due")}:{" "}
            <strong>
              {money(selected.balance)} {t("جنيه", "EGP")}
            </strong>
          </p>
        )}
        {newSupplier && (
          <form
            className="inline-create"
            onSubmit={async (e) => {
              e.preventDefault();
              try {
                const p = await action("partyCreate", {
                  name: supplierName,
                  kind: "supplier",
                  opening: 0,
                  creditLimit: 0,
                  reason: "إضافة مورد من المشتريات",
                });
                setSupplier(p.id);
                setNewSupplier(false);
                setSupplierName("");
              } catch {}
            }}
          >
            <label>
              {t("اسم المورد", "Supplier name")}
              <input
                required
                value={supplierName}
                onChange={(e) => setSupplierName(e.target.value)}
              />
            </label>
            <button className="primary" disabled={busy}>
              {t("حفظ المورد", "Save supplier")}
            </button>
          </form>
        )}
      </section>
      {newProduct && (
        <ProductForm
          action={action}
          busy={busy}
          t={t}
          onCreated={(p) => {
            setRows((r) => [
              ...r.filter((x) => x.productId),
              {
                key: crypto.randomUUID(),
                productId: p.id,
                quantity: "1",
                unit: "base",
                totalCost: "",
              },
            ]);
            setNewProduct(false);
          }}
        />
      )}
      <form
        className="purchase-form"
        onSubmit={async (e) => {
          e.preventDefault();
          setError("");
          setSaved(undefined);
          try {
            if (!supplier)
              throw new Error(
                t("اختر المورد أولًا", "Choose a supplier first"),
              );
            if (paidValue > total)
              throw new Error(
                t(
                  "المدفوع أكبر من إجمالي الفاتورة",
                  "Payment exceeds invoice total",
                ),
              );
            const result = await action("purchase", {
              partyId: supplier,
              lines: rows.map((r) => ({
                productId: r.productId,
                quantity: decimal(r.quantity, 3),
                unit: r.unit,
                price: ratio(
                  decimal(r.totalCost),
                  1000,
                  decimal(r.quantity, 3),
                ),
                totalCost: decimal(r.totalCost),
              })),
              payments: paidValue ? [{ method, amount: paidValue }] : [],
            });
            setSaved({
              ...result,
              supplier: selected?.name,
              paid: paidValue,
              remaining: total - paidValue,
            });
            setRows([
              {
                key: crypto.randomUUID(),
                productId: "",
                quantity: "1",
                unit: "base",
                totalCost: "",
              },
            ]);
            setPaid("0");
          } catch (e) {
            setError(e instanceof Error ? e.message : String(e));
          }
        }}
      >
        <div className="section-heading">
          <h2>{t("٢. الأصناف المشتراة", "2. Purchased items")}</h2>
          <button type="button" onClick={() => setNewProduct(!newProduct)}>
            {t("+ منتج جديد", "+ New product")}
          </button>
        </div>
        <div className="table-wrap">
          <table className="purchase-lines">
            <thead>
              <tr>
                {[
                  t("الصنف", "Item"),
                  t("الكمية", "Quantity"),
                  t("الوحدة", "Unit"),
                  t("إجمالي تكلفة السطر", "Line total cost"),
                  t("تكلفة القطعة", "Cost per base unit"),
                  "",
                ].map((x, i) => (
                  <th key={i}>{x}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => {
                const p = data.products.find((p: any) => p.id === r.productId);
                let cost = "—";
                try {
                  const q = baseQuantity(r);
                  if (q > 0)
                    cost = money(ratio(decimal(r.totalCost || "0"), 1000, q));
                } catch {}
                return (
                  <tr key={r.key}>
                    <td>
                      <select
                        required
                        aria-label={t("الصنف", "Item")}
                        value={r.productId}
                        onChange={(e) => edit(i, "productId", e.target.value)}
                      >
                        <option value="">
                          {t("اختر الصنف…", "Choose item…")}
                        </option>
                        {data.products.map((p: any) => (
                          <option key={p.id} value={p.id}>
                            {p.name}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td>
                      <input
                        aria-label={t("الكمية", "Quantity")}
                        required
                        type="number"
                        min="0.001"
                        step="0.001"
                        value={r.quantity}
                        onChange={(e) => edit(i, "quantity", e.target.value)}
                      />
                    </td>
                    <td>
                      <select
                        aria-label={t("الوحدة", "Unit")}
                        value={r.unit}
                        onChange={(e) => edit(i, "unit", e.target.value)}
                      >
                        <option value="base">
                          {p?.base_unit || t("قطعة", "Unit")}
                        </option>
                        <option value="pack">
                          {p?.pack_name || t("عبوة", "Pack")} (
                          {quantity(p?.pack_factor || 12000)})
                        </option>
                      </select>
                    </td>
                    <td>
                      <input
                        aria-label={t("إجمالي تكلفة السطر", "Line total cost")}
                        required
                        type="number"
                        min="0"
                        step="0.01"
                        value={r.totalCost}
                        onChange={(e) => edit(i, "totalCost", e.target.value)}
                        placeholder="0.00"
                      />
                    </td>
                    <td className="numeric">{cost}</td>
                    <td>
                      <button
                        type="button"
                        aria-label={t("حذف الصنف", "Remove item")}
                        disabled={rows.length === 1}
                        onClick={() =>
                          setRows((s) => s.filter((_, j) => j !== i))
                        }
                      >
                        ×
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <button
          className="add-row"
          type="button"
          onClick={() =>
            setRows((r) => [
              ...r,
              {
                key: crypto.randomUUID(),
                productId: "",
                quantity: "1",
                unit: "base",
                totalCost: "",
              },
            ])
          }
        >
          {t("+ إضافة صنف آخر", "+ Add another item")}
        </button>
        <div className="purchase-payment">
          <section>
            <h2>{t("٣. الدفع", "3. Payment")}</h2>
            <div className="form-grid">
              <label>
                {t("دفعت كام؟", "Amount paid")}
                <input
                  name="paid"
                  required
                  type="number"
                  min="0"
                  step="0.01"
                  value={paid}
                  onChange={(e) => setPaid(e.target.value)}
                />
              </label>
              <label>
                {t("مصدر الدفع", "Payment source")}
                <select
                  value={method}
                  onChange={(e) => setMethod(e.target.value)}
                >
                  <option value="other">
                    {t("من خارج درج الكاشير", "Outside cashier drawer")}
                  </option>
                  <option value="cash" disabled={!data.currentShift}>
                    {t("نقدًا من الوردية المفتوحة", "Cash from open shift")}
                  </option>
                  <option value="card">
                    {t("بطاقة / تحويل مسجل", "Card / recorded transfer")}
                  </option>
                </select>
              </label>
            </div>
            <p className="muted">
              {t(
                "المتبقي يتسجل تلقائيًا في حساب المورد، وتقدر تسدده لاحقًا من العملاء والموردين.",
                "The remaining amount is recorded against the supplier and can be paid later from Parties.",
              )}
            </p>
          </section>
          <section className="invoice-summary">
            <div>
              <span>{t("إجمالي المشتريات", "Purchase total")}</span>
              <strong>{money(total)}</strong>
            </div>
            <div>
              <span>{t("المدفوع", "Paid")}</span>
              <strong>{money(paidValue)}</strong>
            </div>
            <div className="balance">
              <span>{t("الباقي للمورد", "Due to supplier")}</span>
              <strong>{money(total - paidValue)}</strong>
            </div>
            {selected && (
              <small>
                {t(
                  "رصيد المورد بعد الفاتورة",
                  "Supplier balance after invoice",
                )}
                : {money(selected.balance + total - paidValue)}
              </small>
            )}
          </section>
        </div>
        {error && (
          <p role="alert" className="error">
            {error}
          </p>
        )}
        <div className="form-actions">
          <button
            className="primary"
            disabled={busy || !supplier || !rows.length}
          >
            {t("اعتماد الشراء وتحديث المخزون", "Post purchase & update stock")}
          </button>
        </div>
      </form>
      {saved && (
        <section className="panel saved-purchase" role="status">
          <strong>
            {t(
              "تم تسجيل الشراء وتحديث المخزون",
              "Purchase posted and stock updated",
            )}
          </strong>
          <p>
            {saved.supplier} · {t("الإجمالي", "Total")}: {money(saved.total)} ·{" "}
            {t("المدفوع", "Paid")}: {money(saved.paid)} ·{" "}
            {t("المتبقي", "Remaining")}: {money(saved.remaining)}
          </p>
        </section>
      )}
    </>
  );
}
