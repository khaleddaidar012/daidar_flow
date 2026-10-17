import React, { useState } from "react";
import { decimal } from "../core/money";
import { type Props } from "./common";
export function ProductForm({
  action,
  busy,
  t,
  onCreated,
  wizard = false,
}: Omit<Props, "data"> & {
  onCreated?: (p: any, stay?: boolean) => void | Promise<void>;
  wizard?: boolean;
}) {
  const [error, setError] = useState(""),
    [opening, setOpening] = useState("0");
  return (
    <form
      className="product-form"
      onSubmit={async (e) => {
        e.preventDefault();
        const stay =
          (e.nativeEvent as SubmitEvent).submitter?.getAttribute("value") ===
          "more";
        const form = e.currentTarget,
          v = Object.fromEntries(new FormData(form));
        setError("");
        try {
          const result = await action("productQuick", {
            name: String(v.name),
            retail: decimal(String(v.retail)),
            openingQuantity: decimal(String(v.openingQuantity || "0"), 3),
            barcode: String(v.barcode || ""),
            category: String(v.category || ""),
            purchase: decimal(String(v.purchase || "0")),
            packFactor: decimal(String(v.packFactor || "12"), 3),
            ...(v.wholesale ? { wholesale: decimal(String(v.wholesale)) } : {}),
          });
          form.reset();
          setOpening("0");
          await onCreated?.(result, stay);
        } catch (e) {
          setError(String(e));
        }
      }}
    >
      <div className="section-heading">
        <div>
          <h2>{t("إضافة منتج", "Add a product")}</h2>
          <p>
            {t(
              "ابدأ بالأساسيات، والتفاصيل الإضافية حسب احتياجك.",
              "Start with the basics. Other details are optional.",
            )}
          </p>
        </div>
      </div>
      <div className="form-grid">
        <label>
          {t("اسم المنتج", "Product name")}
          <input
            name="name"
            required
            placeholder={t("مثال: شامبو 400 مل", "Example: Shampoo 400 ml")}
          />
        </label>
        <label>
          {t("سعر البيع للقطعة", "Selling price per unit")}
          <input
            name="retail"
            type="number"
            required
            min="0"
            step="0.01"
            placeholder="0.00"
          />
        </label>
        <label>
          {t("المخزون الحالي بالقطعة", "Opening stock in base units")}
          <input
            name="openingQuantity"
            onChange={(e) => setOpening(e.target.value)}
            type="number"
            required
            min="0"
            step="0.001"
            defaultValue="0"
          />
        </label>
      </div>
      {Number(opening) > 0 && (
        <p className="muted">
          {t(
            "لرصيد موجود من قبل، أضف تكلفة الشراء من التفاصيل الاختيارية لحساب الربح بدقة. بدونها يُسجل بتكلفة صفر.",
            "For existing stock, enter its cost in optional details for accurate profit. Without it, stock is valued at zero.",
          )}
        </p>
      )}
      <details className="optional-fields">
        <summary>
          {t(
            "تفاصيل اختيارية: باركود، عبوات وتكلفة شراء",
            "Optional: barcode, packs and purchase cost",
          )}
        </summary>
        <div className="form-grid">
          <label>
            {t(
              "الباركود — امسحه هنا إن وجد",
              "Barcode — scan here if available",
            )}
            <input
              name="barcode"
              placeholder={t(
                "يُولد كود تلقائي إن تركته فارغًا",
                "An internal code is generated if empty",
              )}
              onKeyDown={(e) => {
                if (e.key === "Enter") e.preventDefault();
              }}
            />
          </label>
          <label>
            {t("التصنيف", "Category")}
            <input name="category" />
          </label>
          <label>
            {t(
              "تكلفة شراء القطعة للمخزون الافتتاحي",
              "Opening stock cost per unit",
            )}
            <input
              name="purchase"
              type="number"
              min="0"
              step="0.01"
              defaultValue="0"
            />
          </label>
          <label>
            {t("عدد القطع في العبوة", "Units per pack")}
            <input
              name="packFactor"
              type="number"
              min="0.001"
              step="0.001"
              defaultValue="12"
            />
          </label>
          <label>
            {t("سعر الجملة للقطعة", "Wholesale price per unit")}
            <input name="wholesale" type="number" min="0" step="0.01" />
          </label>
        </div>
        <p className="muted">
          {t(
            "للمخزون القديم، أدخل تكلفة الشراء حتى يكون حساب الربح دقيقًا. إذا تركتها فارغة يُسجل الرصيد بتكلفة صفر.",
            "For existing stock, enter its purchase cost for accurate profit. An empty cost records stock at zero value.",
          )}
        </p>
      </details>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <button className="primary" name="intent" value="next" disabled={busy}>
        {wizard
          ? t("حفظ والتالي", "Save and next")
          : t("حفظ المنتج", "Save product")}
      </button>
      {wizard && (
        <button type="submit" name="intent" value="more" disabled={busy}>
          {t("حفظ وإضافة منتج آخر", "Save and add another product")}
        </button>
      )}
    </form>
  );
}
