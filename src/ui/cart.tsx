import React, { useEffect, useRef, useState } from "react";
import { decimal, ratio } from "../core/money";
import { money, quantity, type Props } from "./common";
export function Cart({
  kind,
  data,
  action,
  busy,
  t,
}: Props & { kind: "sale" | "purchase" }) {
  const [search, setSearch] = useState(""),
    [cart, setCart] = useState<any[]>([]),
    [party, setParty] = useState(""),
    [discount, setDiscount] = useState("0"),
    [cash, setCash] = useState("0"),
    [card, setCard] = useState("0"),
    [other, setOther] = useState("0"),
    [last, setLast] = useState(""),
    [local, setLocal] = useState("");
  const input = useRef<HTMLInputElement>(null),
    form = useRef<HTMLFormElement>(null);
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "F2") {
        e.preventDefault();
        input.current?.focus();
      }
      if (e.key === "F8") {
        e.preventDefault();
        form.current?.requestSubmit();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);
  const add = (p: any) => {
    setCart((c) =>
      c.some((x) => x.productId === p.id)
        ? c.map((x) =>
            x.productId === p.id
              ? { ...x, quantity: String(Number(x.quantity) + 1) }
              : x,
          )
        : [
            ...c,
            {
              productId: p.id,
              name: p.name,
              quantity: "1",
              unit: "base",
              price: money(kind === "sale" ? p.retail : p.purchase),
            },
          ],
    );
    setSearch("");
    input.current?.focus();
  };
  const update = (i: number, key: string, value: string) =>
    setCart((c) => c.map((x, j) => (i === j ? { ...x, [key]: value } : x)));
  const build = () => ({
    lines: cart.map(({ productId, quantity, unit, price }) => ({
      productId,
      quantity: decimal(quantity, 3),
      unit,
      price: decimal(price),
    })),
    ...(party ? { partyId: party } : {}),
    ...(kind === "sale" ? { discount: decimal(discount) } : {}),
    payments: [
      ["cash", cash],
      ["card", card],
      ["other", other],
    ]
      .filter(([, n]) => decimal(n) > 0)
      .map(([method, n]) => ({ method, amount: decimal(n) })),
  });
  let total = 0;
  try {
    total =
      cart.reduce(
        (s, x) => s + ratio(decimal(x.price), decimal(x.quantity, 3), 1000),
        0,
      ) - (kind === "sale" ? decimal(discount) : 0);
  } catch {}
  const visible = data.products
    .filter(
      (p: any) =>
        p.name.toLowerCase().includes(search.toLowerCase()) ||
        p.barcode.includes(search),
    )
    .slice(0, 12);
  return (
    <>
      <h1>
        {kind === "sale"
          ? t("الكاشير", "Point of sale")
          : t("فاتورة شراء", "Purchase invoice")}
      </h1>
      <p className="muted">
        F2 {t("بحث", "Search")} · F8 {t("اعتماد", "Post")} ·{" "}
        {t(
          "الباركود ككيبورد: امسح ثم Enter",
          "Keyboard scanner: scan then Enter",
        )}
      </p>
      <div className="pos">
        <section>
          <label>
            {t("اسم أو باركود", "Name or barcode")}
            <input
              autoFocus
              ref={input}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  const p = data.products.find(
                    (p: any) => p.barcode === search.trim(),
                  );
                  if (p) {
                    setLocal("");
                    add(p);
                  } else
                    setLocal(
                      t(
                        "الباركود غير مسجل. أضفه للمنتج من التفاصيل الاختيارية، أو ابحث بالاسم.",
                        "Barcode not registered. Add it to the product or search by name.",
                      ),
                    );
                }
              }}
            />
          </label>
          <div className="product-grid">
            {visible.map((p: any) => (
              <button key={p.id} className="product" onClick={() => add(p)}>
                <strong>{p.name}</strong>
                <small>{p.barcode}</small>
                <span>
                  {money(kind === "sale" ? p.retail : p.purchase)} ·{" "}
                  {quantity(p.quantity)} {p.base_unit}
                </span>
              </button>
            ))}
          </div>
          {search && visible.length === 0 && (
            <p className="muted">
              {t(
                "لا يوجد منتج مطابق. تأكد من تسجيل الباركود في بيانات المنتج.",
                "No matching product. Check the registered barcode.",
              )}
            </p>
          )}
          {!data.products.length && (
            <p>{t("أضف منتجات أولًا", "Add products first")}</p>
          )}
          {kind === "sale" && (
            <>
              <h2>{t("فواتير معلقة", "Held carts")}</h2>
              {data.holds.map((h: any) => (
                <button
                  key={h.id}
                  onClick={() => {
                    if (
                      cart.length &&
                      !window.confirm(
                        t("استبدال السلة الحالية؟", "Replace current cart?"),
                      )
                    )
                      return;
                    setCart(
                      h.cart.lines.map((l: any) => ({
                        ...l,
                        name: data.products.find(
                          (p: any) => p.id === l.productId,
                        )?.name,
                        quantity: quantity(l.quantity),
                        price: money(l.price),
                      })),
                    );
                    setDiscount(money(h.cart.discount));
                    setParty(h.cart.partyId || "");
                    action("holdDelete", { id: h.id }).catch(() => undefined);
                  }}
                >
                  {h.label}
                </button>
              ))}
            </>
          )}
        </section>
        <form
          ref={form}
          className="cart"
          onSubmit={async (e) => {
            e.preventDefault();
            setLocal("");
            try {
              if (!cart.length)
                throw new Error(t("السلة فارغة", "Cart is empty"));
              const r = await action(kind, build());
              setLast(r.id);
              setCart([]);
              setCash("0");
              setCard("0");
              setOther("0");
              setDiscount("0");
              input.current?.focus();
            } catch (e) {
              setLocal(String(e));
            }
          }}
        >
          <h2>{t("تفاصيل الفاتورة", "Invoice details")}</h2>
          {cart.map((x, i) => (
            <div className="cart-line" key={x.productId}>
              <strong>{x.name}</strong>
              <button
                type="button"
                aria-label={t("حذف السطر", "Remove line")}
                onClick={() => setCart((c) => c.filter((_, j) => j !== i))}
              >
                ×
              </button>
              <label>
                {t("كمية", "Quantity")}
                <input
                  type="number"
                  min="0.001"
                  step="0.001"
                  value={x.quantity}
                  onChange={(e) => update(i, "quantity", e.target.value)}
                />
              </label>
              <label>
                {t("وحدة", "Unit")}
                <select
                  value={x.unit}
                  onChange={(e) => {
                    const p = data.products.find(
                        (p: any) => p.id === x.productId,
                      ),
                      unit = e.target.value;
                    update(i, "unit", unit);
                    update(
                      i,
                      "price",
                      money(
                        ratio(
                          kind === "sale" ? p.retail : p.purchase,
                          unit === "pack" ? p.pack_factor : 1000,
                          1000,
                        ),
                      ),
                    );
                  }}
                >
                  <option value="base">{t("أساسية", "Base")}</option>
                  <option value="pack">{t("عبوة", "Pack")}</option>
                </select>
              </label>
              <label>
                {t("سعر للوحدة المختارة", "Selected unit price")}
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={x.price}
                  onChange={(e) => update(i, "price", e.target.value)}
                />
              </label>
            </div>
          ))}
          <label>
            {kind === "sale"
              ? t("عميل للآجل", "Customer for credit")
              : t("مورد للآجل", "Supplier for credit")}
            <select value={party} onChange={(e) => setParty(e.target.value)}>
              <option value="">—</option>
              {data.parties
                .filter(
                  (p: any) =>
                    p.kind === (kind === "sale" ? "customer" : "supplier"),
                )
                .map((p: any) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
            </select>
          </label>
          {kind === "sale" && (
            <label>
              {t("خصم إجمالي بصلاحية", "Authorized total discount")}
              <input
                type="number"
                min="0"
                step="0.01"
                value={discount}
                onChange={(e) => setDiscount(e.target.value)}
              />
            </label>
          )}
          <div className="total">
            {t("الإجمالي", "Total")}: {money(total)}
          </div>
          <div className="form-grid">
            {[
              [t("نقدي", "Cash"), cash, setCash],
              [t("بطاقة", "Card"), card, setCard],
              [t("وسيلة أخرى", "Other"), other, setOther],
            ].map(([name, v, setter]: any, i) => (
              <label key={i}>
                {name}
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={v}
                  onChange={(e) => setter(e.target.value)}
                />
              </label>
            ))}
          </div>
          <button
            type="button"
            onClick={() => {
              try {
                setCash(
                  money(Math.max(0, total - decimal(card) - decimal(other))),
                );
              } catch {}
            }}
          >
            {t("الباقي نقدي", "Remaining in cash")}
          </button>
          {local && (
            <p role="alert" className="error">
              {local}
            </p>
          )}
          <button className="primary" disabled={busy || !cart.length}>
            {t("اعتماد الفاتورة F8", "Post invoice F8")}
          </button>
          {kind === "sale" && (
            <button
              type="button"
              disabled={busy || !cart.length}
              onClick={async () => {
                try {
                  const p = build();
                  await action("hold", {
                    label: new Date().toLocaleString(),
                    cart: {
                      lines: p.lines,
                      discount: p.discount,
                      ...(party ? { partyId: party } : {}),
                    },
                  });
                  setCart([]);
                } catch {}
              }}
            >
              {t("تعليق الفاتورة", "Hold cart")}
            </button>
          )}
          {last && (
            <>
              <p>{last}</p>
              <button
                type="button"
                onClick={() =>
                  action("print", { documentId: last, reason: "" }).catch(
                    () => undefined,
                  )
                }
              >
                {t("طباعة الإيصال", "Print receipt")}
              </button>
            </>
          )}
        </form>
      </div>
    </>
  );
}
