import React, { useEffect, useRef, useState } from "react";
import { ProductForm } from "./product-form";
import { Table, money, quantity, type Props } from "./common";
import { decimal } from "../core/money";
export function SetupWizard({
  state,
  data,
  action,
  busy,
  t,
}: Props & { state: any }) {
  const step = state.step,
    [local, setLocal] = useState(""),
    [managerOnly, setManagerOnly] = useState(!!state.managerOnly);
  const employeeForm = useRef<HTMLFormElement>(null),
    heading = useRef<HTMLHeadingElement>(null),
    previousStep = useRef(step);
  const suppliers = data.parties.filter((p: any) => p.kind === "supplier");
  const employees = data.users.filter((p: any) => p.role !== "manager");
  const labels = [
    t("الموردين", "Suppliers"),
    t("المنتجات", "Products"),
    t("الموظفين", "Employees"),
  ];
  useEffect(() => {
    setLocal("");
    if (step !== 2) {
      const field = employeeForm.current?.elements.namedItem(
        "password",
      ) as HTMLInputElement | null;
      if (field) field.value = "";
    }
    if (previousStep.current !== step) {
      heading.current?.focus();
      previousStep.current = step;
    }
  }, [step]);
  const move = async (next: number) => {
    setLocal("");
    try {
      await action("onboardingMove", {
        step: next,
        expectedStep: step,
        managerOnly,
      });
    } catch (e) {
      setLocal(e instanceof Error ? e.message : String(e));
    }
  };
  const save = async (
    command: string,
    payload: any,
    stay: boolean,
    form: HTMLFormElement,
  ) => {
    setLocal("");
    try {
      await action(command, payload);
      form.reset();
      if (!stay) await move(step + 1);
    } catch (e) {
      setLocal(e instanceof Error ? e.message : String(e));
    }
  };
  return (
    <div className="setup-container">
      <div className="setup-title">
        <span className="eyebrow">
          {t("بداية مرتبة لشغلك", "A clear start for your business")}
        </span>
        <h1 ref={heading} tabIndex={-1}>
          {step === 3
            ? t("أنت جاهز الآن!", "You are ready!")
            : t("إعداد متجرك لأول مرة", "Set up your store")}
        </h1>
        <p>
          {step === 3
            ? t(
                "اتحفظت بياناتك الأساسية. تقدر تبدأ البيع وتكمّل باقي التفاصيل في أي وقت.",
                "Your initial data is saved. Start working and add more details whenever you need.",
              )
            : t(
                "٣ خطوات بسيطة: نضيف الموردين، المنتجات، وبعدها حسابات الموظفين.",
                "Three simple steps: suppliers, products, then employee accounts.",
              )}
        </p>
      </div>
      <aside
        className="setup-progress"
        aria-label={t("خطوات الإعداد", "Setup progress")}
      >
        <ol>
          {labels.map((label, i) => (
            <li
              key={label}
              aria-current={step === i ? "step" : undefined}
              className={step > i ? "done" : step === i ? "current" : ""}
            >
              <span className="step-number">{step > i ? "✓" : i + 1}</span>
              <div>
                <strong>{label}</strong>
                <small>
                  {i === 0
                    ? t("مين بتشتري منه؟", "Who do you buy from?")
                    : i === 1
                      ? t("إيه المنتجات اللي عندك؟", "What do you sell?")
                      : t("مين هيشتغل معاك؟", "Who works with you?")}
                </small>
              </div>
            </li>
          ))}
        </ol>
        <p>
          {t(
            "البيانات المحفوظة بتفضل موجودة لو رجعت خطوة أو قفلت البرنامج.",
            "Saved records remain if you go back or close the app.",
          )}
        </p>
      </aside>
      <section className="setup-body">
        {step > 0 && (
          <div className="setup-back">
            <button disabled={busy} onClick={() => move(step - 1)}>
              → {t("رجوع", "Back")}
            </button>
            <span>
              {step === 3
                ? t("مراجعة الإعدادات", "Review setup")
                : t("خطوة", "Step") + " " + (step + 1) + " / 3"}
            </span>
          </div>
        )}

        {local && (
          <p className="error" role="alert">
            {local}
          </p>
        )}
        <div hidden={step !== 0} className="setup-pane">
          <form
            className="setup-supplier"
            onSubmit={async (e) => {
              e.preventDefault();
              const form = e.currentTarget,
                v = Object.fromEntries(new FormData(form));
              try {
                await save(
                  "partyCreate",
                  {
                    name: String(v.name).trim(),
                    kind: "supplier",
                    opening: decimal(String(v.opening || "0")),
                    creditLimit: 0,
                    reason: "رصيد افتتاحي من الإعداد الأولي",
                  },
                  (e.nativeEvent as SubmitEvent).submitter?.getAttribute(
                    "value",
                  ) === "more",
                  form,
                );
              } catch (e) {
                setLocal(String(e));
              }
            }}
          >
            <h2>{t("أضف أول مورد", "Add your first supplier")}</h2>
            <p className="muted">
              {t(
                "مثال: خالد دعيدر. هتلاقي حسابه جاهز لما تسجل المشتريات والمدفوعات.",
                "For example, your main supplier. Their account will be ready for purchases and payments.",
              )}
            </p>
            <label>
              {t("اسم المورد", "Supplier name")}
              <input
                name="name"
                required
                maxLength={160}
                autoComplete="organization"
                placeholder={t("اكتب اسم المورد", "Enter supplier name")}
              />
            </label>
            <details className="optional-fields">
              <summary>
                {t(
                  "رصيد قديم للمورد؟ (اختياري)",
                  "Existing balance? (optional)",
                )}
              </summary>
              <label>
                {t(
                  "مبلغ مستحق للمورد قبل استخدام البرنامج",
                  "Amount already owed to this supplier",
                )}
                <input
                  name="opening"
                  type="number"
                  min="0"
                  step="0.01"
                  defaultValue="0"
                />
              </label>
            </details>
            <button
              className="primary"
              name="intent"
              value="next"
              disabled={busy}
            >
              {t("حفظ والتالي", "Save and next")}
            </button>
            <button name="intent" value="more" disabled={busy}>
              {t("حفظ وإضافة مورد آخر", "Save and add another supplier")}
            </button>
          </form>
          {suppliers.length > 0 && (
            <div className="setup-saved">
              <h3>
                {t("موردين محفوظين", "Saved suppliers")} ({suppliers.length})
              </h3>
              <Table
                columns={[
                  t("المورد", "Supplier"),
                  t("الرصيد المستحق", "Balance due"),
                ]}
                rows={suppliers
                  .slice(0, 5)
                  .map((p: any) => [p.name, money(p.balance)])}
              />
              <button disabled={busy} onClick={() => move(1)}>
                {t(
                  "التالي بالموردين المحفوظين",
                  "Continue with saved suppliers",
                )}{" "}
                ←
              </button>
            </div>
          )}
        </div>
        <div hidden={step !== 1} className="setup-pane">
          <ProductForm
            action={action}
            busy={busy}
            t={t}
            wizard
            onCreated={async (_p, stay) => {
              if (!stay) await move(2);
            }}
          />
          {data.products.length > 0 && (
            <div className="setup-saved">
              <h3>
                {t("منتجات محفوظة", "Saved products")} ({data.products.length})
              </h3>
              <Table
                columns={[
                  t("المنتج", "Product"),
                  t("السعر", "Price"),
                  t("المخزون", "Stock"),
                ]}
                rows={data.products
                  .slice(0, 5)
                  .map((p: any) => [
                    p.name,
                    money(p.retail),
                    quantity(p.quantity),
                  ])}
              />
              <button disabled={busy} onClick={() => move(2)}>
                {t("التالي بالمنتجات المحفوظة", "Continue with saved products")}{" "}
                ←
              </button>
            </div>
          )}
        </div>
        <div hidden={step !== 2} className="setup-pane">
          <form
            ref={employeeForm}
            className="setup-employee"
            onSubmit={async (e) => {
              e.preventDefault();
              const form = e.currentTarget,
                v = Object.fromEntries(new FormData(form));
              await save(
                "userCreate",
                {
                  username: String(v.username).trim(),
                  password: String(v.password),
                  role: String(v.role),
                },
                (e.nativeEvent as SubmitEvent).submitter?.getAttribute(
                  "value",
                ) === "more",
                form,
              );
            }}
          >
            <h2>{t("مين هيشتغل معاك؟", "Who will work with you?")}</h2>
            <p className="muted">
              {t(
                "الحساب ده محلي للبرنامج. كلمة المرور مؤقتة، والموظف لازم يغيّرها عند أول دخول.",
                "This account is local to the app. The temporary password must be changed on first sign-in.",
              )}
            </p>
            <div className="form-grid">
              <label>
                {t("اسم مستخدم الموظف", "Employee username")}
                <input
                  name="username"
                  required
                  minLength={3}
                  maxLength={60}
                  autoComplete="off"
                />
              </label>
              <label>
                {t(
                  "كلمة مرور مؤقتة (١٠ أحرف على الأقل)",
                  "Temporary password (at least 10 characters)",
                )}
                <input
                  name="password"
                  type="password"
                  required
                  minLength={10}
                  maxLength={128}
                  autoComplete="new-password"
                />
              </label>
              <label>
                {t("الدور", "Role")}
                <select name="role">
                  <option value="cashier">{t("كاشير", "Cashier")}</option>
                  <option value="stock">
                    {t("مسؤول مخزن", "Stock operator")}
                  </option>
                </select>
              </label>
            </div>
            <button
              className="primary"
              name="intent"
              value="next"
              disabled={busy}
            >
              {t("حفظ والتالي", "Save and next")}
            </button>
            <button name="intent" value="more" disabled={busy}>
              {t("حفظ وإضافة موظف آخر", "Save and add another employee")}
            </button>
          </form>
          {employees.length > 0 && (
            <div className="setup-saved">
              <h3>
                {t("موظفين محفوظين", "Saved employees")} ({employees.length})
              </h3>
              <Table
                columns={[t("اسم المستخدم", "Username"), t("الدور", "Role")]}
                rows={employees
                  .slice(0, 5)
                  .map((u: any) => [
                    u.username,
                    u.role === "cashier"
                      ? t("كاشير", "Cashier")
                      : t("مخزن", "Stock"),
                  ])}
              />
              <button disabled={busy} onClick={() => move(3)}>
                {t(
                  "التالي بالموظفين المحفوظين",
                  "Continue with saved employees",
                )}{" "}
                ←
              </button>
            </div>
          )}
          {!employees.length && (
            <div className="solo-option">
              <label>
                <input
                  type="checkbox"
                  checked={managerOnly}
                  onChange={(e) => setManagerOnly(e.target.checked)}
                />
                <span>
                  {t(
                    "هشتغل بحساب المدير فقط حاليًا، وأضيف الموظفين بعدين.",
                    "I will use the manager account for now and add employees later.",
                  )}
                </span>
              </label>
              <button disabled={busy || !managerOnly} onClick={() => move(3)}>
                {t("متابعة بحساب المدير", "Continue with manager account")}
              </button>
            </div>
          )}
        </div>
        <div hidden={step !== 3} className="setup-pane setup-ready">
          <div className="ready-check" aria-hidden="true">
            ✓
          </div>
          <h2>{t("كل حاجة أساسية بقت جاهزة", "Your essentials are ready")}</h2>
          <p>
            {t(
              "الموردين والمنتجات والحسابات اتحفظوا. الخطوة الجاية تفتح وردية وتبدأ شغلك.",
              "Suppliers, products and accounts have been saved. Next, open a shift and start working.",
            )}
          </p>
          <div className="ready-counts">
            <div>
              <strong>{state.counts.suppliers}</strong>
              <span>{t("مورد", "suppliers")}</span>
            </div>
            <div>
              <strong>{state.counts.products}</strong>
              <span>{t("منتج", "products")}</span>
            </div>
            <div>
              <strong>{state.counts.employees}</strong>
              <span>
                {state.managerOnly && !state.counts.employees
                  ? t("حساب المدير فقط", "manager only")
                  : t("موظف", "employees")}
              </span>
            </div>
          </div>
          <button
            className="primary start-working"
            disabled={busy}
            onClick={() =>
              action("onboardingComplete", {}).catch(() => undefined)
            }
          >
            {t("ابدأ الشغل", "Start working")} ←
          </button>
          <small>
            {t(
              "صفحات الإعداد دي مش هتظهر تاني بعد ما تبدأ. تقدر تعدّل البيانات من أقسام البرنامج.",
              "This setup will no longer appear. You can edit your data in the app sections.",
            )}
          </small>
        </div>
      </section>
    </div>
  );
}
