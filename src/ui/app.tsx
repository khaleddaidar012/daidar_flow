import React, { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import type { Command } from "../core/contracts";
import { Form, Card, Table, money, type Action } from "./common";
import { Cart } from "./cart";
import {
  Products,
  Inventory,
  Documents,
  Shifts,
  Parties,
  Reports,
  Users,
} from "./pages";
import "./style.css";
declare global {
  interface Window {
    flow: {
      invoke: (
        command: Command,
        payload: unknown,
      ) => Promise<{ ok: boolean; data?: any; error?: string }>;
    };
  }
}
function App() {
  const [lang, setLang] = useState("ar"),
    [boot, setBoot] = useState<any>(),
    [data, setData] = useState<any>(),
    [page, setPage] = useState("dashboard"),
    [busy, setBusy] = useState(false),
    [notices, setNotices] = useState(""),
    [notice, setNotice] = useState(""),
    [error, setError] = useState("");
  const t = (ar: string, en: string) => (lang === "ar" ? ar : en);
  const pending = useRef(new Map<string, string>());
  async function call(command: Command, payload: any = {}) {
    const r = await window.flow.invoke(command, payload);
    if (!r.ok) throw new Error(r.error);
    return r.data;
  }
  async function refresh() {
    const b = await call("bootstrap");
    setBoot(b);
    if (b.session && !b.session.mustChange) setData(await call("snapshot"));
    else setData(undefined);
  }
  useEffect(() => {
    refresh().catch((e) => setError(String(e)));
    const timer = setInterval(
      () =>
        call("bootstrap")
          .then(setBoot)
          .catch(() => undefined),
      60000,
    );
    return () => clearInterval(timer);
  }, []);
  useEffect(() => {
    document.documentElement.dir = lang === "ar" ? "rtl" : "ltr";
    document.documentElement.lang = lang;
  }, [lang]);
  const action: Action = async (command, payload = {}) => {
    setBusy(true);
    setError("");
    setNotice("");
    const key = JSON.stringify({ command, payload });
    if (
      [
        "sale",
        "purchase",
        "return",
        "shiftOpen",
        "shiftClose",
        "cash",
        "adjust",
        "partyPay",
        "hold",
      ].includes(command)
    ) {
      if (!pending.current.has(key))
        pending.current.set(key, crypto.randomUUID());
      payload = { ...payload, operationId: pending.current.get(key) };
    }
    try {
      const result = await call(command, payload);
      pending.current.delete(key);
      await refresh();
      setNotice(
        result?.cancelled
          ? t("تم الإلغاء", "Cancelled")
          : t("تمت العملية بنجاح", "Operation completed"),
      );
      return result;
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      throw e;
    } finally {
      setBusy(false);
    }
  };
  const execute = (command: Command, payload: any = {}) => {
    action(command, payload).catch(() => undefined);
  };
  const header = (
    <header>
      <div className="brand">
        <img src="../../public/logo.png" alt="Daidar" />
        <div>
          <strong>{t("دعيدر فلو", "Daidar Flow")}</strong>
          <small>
            {t("شغلك كله… في مسار واحد", "All your work… in one flow")}
          </small>
        </div>
      </div>
      <div className="tools">
        <button onClick={() => setLang(lang === "ar" ? "en" : "ar")}>
          {lang === "ar" ? "English" : "العربية"}
        </button>
        {boot?.session && (
          <>
            <span>
              {boot.session.username} · {boot.session.role}
            </span>
            <button
              onClick={() => {
                setPage("dashboard");
                execute("logout");
              }}
            >
              {t("خروج", "Log out")}
            </button>
          </>
        )}
      </div>
    </header>
  );
  const status = (
    <>
      {boot?.pilot && (
        <div role="status" className="status">
          {t(
            "وضع تجربة — محاكي هب محلي، وليس اشتراكًا تجاريًا",
            "Pilot mode — local Hub simulator, not a commercial subscription",
          )}
        </div>
      )}
      {busy && (
        <div role="status" className="status">
          {t("جاري التنفيذ…", "Working…")}
        </div>
      )}
      {error && (
        <div role="alert" className="error">
          {error}
        </div>
      )}
      {notice && (
        <div role="status" className="success">
          {notice}
        </div>
      )}
    </>
  );
  const footer = (
    <footer>
      <img src="../../public/logo.png" alt="Daidar" />
      Developed by Daidar · Daidar Hub{" "}
      <button onClick={() => execute("companyLink", { name: "website" })}>
        {t("موقع الشركة", "Company website")}
      </button>
    </footer>
  );
  if (!boot)
    return (
      <>
        {header}
        <main>
          {status}
          {t("جاري فتح قاعدة البيانات…", "Opening database…")}
        </main>
      </>
    );
  if (!boot.hasManager && !boot.license.active)
    return (
      <>
        {header}
        <main className="onboarding">
          {status}
          <h1>{t("تفعيل دعيدر فلو", "Activate Daidar Flow")}</h1>
          <p>
            {t(
              "اربط الجهاز بحساب المالك في دعيدر هب، ثم أنشئ مديرًا محليًا. كلمة مرور هب لا تُحفظ هنا.",
              "Link this device using your Daidar Hub owner account, then create a local manager. Hub passwords are never stored here.",
            )}
          </p>
          <p className="muted">
            {t(
              "إصدار تجريبي 0.1.0. إن لم تتوفر البوابة، استخدم محاكي التطوير وفق الدليل.",
              "Pilot 0.1.0. Use the separate simulator for development if Hub is unavailable.",
            )}
          </p>
          <code>{boot.license.device}</code>
          <div className="row">
            <button
              className="primary"
              disabled={busy}
              onClick={() => execute("activateStart")}
            >
              {t("فتح دعيدر هب للتفعيل", "Open Hub activation")}
            </button>
            <button disabled={busy} onClick={() => execute("activatePoll")}>
              {t("التحقق بعد الموافقة", "Check approval")}
            </button>
            <button disabled={busy} onClick={() => execute("licenseImport")}>
              {t("استيراد رخصة موقعة", "Import signed license")}
            </button>
          </div>
        </main>
        {footer}
      </>
    );
  if (!boot.hasManager)
    return (
      <>
        {header}
        <main className="onboarding">
          {status}
          <h1>{t("إنشاء المدير المحلي", "Create local manager")}</h1>
          <Form
            fields={[
              ["business", t("اسم المنشأة", "Business name"), "text"],
              ["username", t("اسم المستخدم", "Username"), "text"],
              [
                "password",
                t(
                  "كلمة مرور 10 أحرف على الأقل",
                  "Password, at least 10 characters",
                ),
                "password",
              ],
            ]}
            submit={t("إنشاء المدير", "Create manager")}
            busy={busy}
            onSubmit={(v) => action("setup", v)}
          />
        </main>
        {footer}
      </>
    );
  if (!boot.session)
    return (
      <>
        {header}
        <main className="onboarding">
          {status}
          <h1>{t("تسجيل الدخول المحلي", "Local sign in")}</h1>
          <p>{boot.business}</p>
          <Form
            fields={[
              ["username", t("اسم المستخدم", "Username"), "text"],
              ["password", t("كلمة المرور", "Password"), "password"],
            ]}
            submit={t("دخول", "Sign in")}
            busy={busy}
            onSubmit={(v) => action("login", v)}
          />
          <p>
            {t(
              "يعمل الدخول المحلي دون إنترنت بعد التفعيل.",
              "Local sign in works offline after activation.",
            )}
          </p>
        </main>
        {footer}
      </>
    );
  if (boot.session.mustChange)
    return (
      <>
        {header}
        <main className="onboarding">
          {status}
          <h1>{t("تغيير كلمة المرور المؤقتة", "Change temporary password")}</h1>
          <Form
            fields={[
              [
                "oldPassword",
                t("الكلمة المؤقتة", "Temporary password"),
                "password",
              ],
              [
                "newPassword",
                t("الكلمة الجديدة (10 أحرف)", "New password (10 characters)"),
                "password",
              ],
            ]}
            submit={t("حفظ", "Save")}
            busy={busy}
            onSubmit={(v) => action("password", v)}
          />
        </main>
      </>
    );
  const manager = boot.session.role === "manager",
    stock = manager || boot.session.role === "stock",
    cashier = manager || boot.session.role === "cashier";
  const tabs = [
    ["dashboard", t("نظرة عامة", "Overview")],
    ...(cashier ? [["sale", t("الكاشير", "POS")]] : []),
    ...(stock
      ? [
          ["purchase", t("المشتريات", "Purchases")],
          ["products", t("المنتجات", "Products")],
          ["inventory", t("المخزون والجرد", "Inventory")],
        ]
      : []),
    ["documents", t("الفواتير والمرتجعات", "Documents & returns")],
    ...(cashier ? [["shifts", t("الوردية والنقدية", "Shift & cash")]] : []),
    ...(manager
      ? [
          ["parties", t("العملاء والموردون", "Parties")],
          ["users", t("المستخدمون", "Users")],
        ]
      : []),
    ...(stock ? [["reports", t("التقارير", "Reports")]] : []),
    ["license", t("الاشتراك", "Subscription")],
    ...(stock ? [["backup", t("النسخ والتصدير", "Backups & export")]] : []),
    ["about", t("حول البرنامج", "About")],
  ];
  const props = { data, action, busy, t };
  const content = () => {
    if (!data) return <p>{t("جاري التحميل", "Loading")}</p>;
    switch (page) {
      case "dashboard":
        return (
          <>
            <div className="hero">
              <span>{t("متجر عام · محلي", "General store · local")}</span>
              <h1>{boot.business}</h1>
              <p>
                {t(
                  "بيانات جهازك الفعلية. أضف منتجًا وشراء ثم افتح وردية للبيع.",
                  "Your actual local data. Add a product and purchase, then open a selling shift.",
                )}
              </p>
            </div>
            <div className="cards">
              <Card
                title={t("عدد المنتجات", "Products")}
                value={data.products.length}
              />
              <Card
                title={t("فواتير محفوظة", "Saved documents")}
                value={data.documents.length}
              />
              <Card
                title={t("الوردية", "Shift")}
                value={
                  data.currentShift ? t("مفتوحة", "Open") : t("مغلقة", "Closed")
                }
              />
              <Card
                title={t("النقد المتوقع", "Expected cash")}
                value={money(data.currentShift?.expected)}
              />
            </div>
            <h2>{t("آخر العمليات", "Recent activity")}</h2>
            <Table
              columns={[
                "ID",
                t("النوع", "Type"),
                t("الوقت", "Time"),
                t("الإجمالي", "Total"),
              ]}
              rows={data.documents
                .slice(0, 8)
                .map((d: any) => [
                  d.id.slice(0, 8),
                  d.kind,
                  new Date(d.created).toLocaleString(),
                  money(d.total),
                ])}
            />
          </>
        );
      case "sale":
      case "purchase":
        return <Cart key={page} kind={page} {...props} />;
      case "products":
        return <Products {...props} />;
      case "inventory":
        return <Inventory {...props} />;
      case "documents":
        return <Documents {...props} />;
      case "shifts":
        return <Shifts {...props} manager={manager} />;
      case "parties":
        return <Parties {...props} />;
      case "reports":
        return <Reports {...props} />;
      case "users":
        return <Users {...props} session={boot.session} />;
      case "license":
        return (
          <>
            <h1>{t("الاشتراك والتفعيل", "Subscription & activation")}</h1>
            <p className={boot.license.active ? "success" : "error"}>
              {boot.license.active
                ? t("الرخصة سارية", "License active")
                : t(
                    "المعاملات الجديدة متوقفة؛ بياناتك محفوظة",
                    "New transactions blocked; data retained",
                  )}
            </p>
            <dl>
              <dt>{t("انتهاء الاشتراك", "Subscription expires")}</dt>
              <dd>{boot.license.claims?.expiresAt || "—"}</dd>
              <dt>{t("مهلة أوفلاين", "Offline deadline")}</dt>
              <dd>{boot.license.claims?.offlineUntil || "—"}</dd>
              <dt>{t("نسخة الرخصة", "License version")}</dt>
              <dd>{boot.license.claims?.version || "—"}</dd>
              <dt>{t("الجهاز", "Device")}</dt>
              <dd>
                <code>{boot.license.device}</code>
              </dd>
            </dl>
            {boot.license.remaining <= 5 * 86400000 && (
              <p role="status">
                {t("المتبقي", "Remaining")}:{" "}
                {Math.floor(boot.license.remaining / 86400000)}{" "}
                {t("يوم", "days")} ·{" "}
                {Math.floor(boot.license.remaining / 3600000) % 24}{" "}
                {t("ساعة", "hours")} ·{" "}
                {Math.floor(boot.license.remaining / 60000) % 60}{" "}
                {t("دقيقة", "minutes")}
              </p>
            )}
            {boot.license.clockWarning && (
              <p role="alert">
                {t(
                  "ساعة الجهاز أقدم من آخر وقت موثوق. تحقق من الوقت واتصال هب.",
                  "Device time is behind trusted time. Check clock and Hub connection.",
                )}
              </p>
            )}
            <div className="row">
              <button disabled={busy} onClick={() => execute("licenseRefresh")}>
                {t("جلب تجديد هب", "Refresh from Hub")}
              </button>
              <button disabled={busy} onClick={() => execute("licenseImport")}>
                {t("استيراد تجديد موقّع", "Import signed renewal")}
              </button>
            </div>
            <p>
              {t(
                "الأسعار والمدة مصدرها هب. نقل الجهاز واستعادة المدير الوحيد يحتاجان خدمة هب ولم يُفعّلا في هذا الإصدار.",
                "Pricing and duration come from Hub. Device transfer and sole-manager recovery need Hub and are unavailable in this pilot.",
              )}
            </p>
          </>
        );
      case "backup":
        return (
          <>
            <h1>{t("حفظ بياناتك", "Protect your data")}</h1>
            <p>
              {t(
                "نسخة SQLite متسقة يوميًا عند تشغيل البرنامج. احفظ نسخة خارج الجهاز؛ نفس القرص لا يحمي من تلفه.",
                "Daily consistent SQLite backup while running. Keep an external copy; the same disk cannot protect against device failure.",
              )}
            </p>
            <div className="row">
              <button disabled={busy} onClick={() => execute("backup")}>
                {t("نسخة يدوية", "Manual backup")}
              </button>
              {manager && (
                <button disabled={busy} onClick={() => execute("export")}>
                  {t("تصدير بيانات JSON", "Export JSON data")}
                </button>
              )}
            </div>
            {manager && (
              <>
                <h2>{t("استعادة نسخة", "Restore backup")}</h2>
                <p>
                  {t(
                    "يُفحص الملف وتُحفظ نسخة أمان قبل الاستبدال. أغلق المعاملات وأعد الدخول بعد الاستعادة.",
                    "File validation and safety backup precede replacement. Finish transactions and sign in again after restore.",
                  )}
                </p>
                <Form
                  busy={busy}
                  submit={t(
                    "اختيار نسخة واستعادة",
                    "Choose and restore backup",
                  )}
                  fields={[
                    [
                      "managerPassword",
                      t("كلمة المدير", "Manager password"),
                      "password",
                    ],
                    ["reason", t("سبب الاستعادة", "Restore reason"), "text"],
                  ]}
                  onSubmit={(v) => action("restore", v)}
                />
              </>
            )}
          </>
        );
      default:
        return (
          <>
            <h1>{t("حول دعيدر فلو", "About Daidar Flow")}</h1>
            <img
              className="about-logo"
              src="../../public/logo.png"
              alt="Daidar"
            />
            <h2>دعيدر فلو | Daidar Flow 0.1.0</h2>
            <p>
              {t(
                "يتبع دعيدر هب — إصدار تجريبي لمتجر عام",
                "Part of Daidar Hub — general-store pilot",
              )}
            </p>
            <p>Developed by Daidar</p>
            <button
              onClick={() =>
                action("notices")
                  .then(setNotices)
                  .catch(() => undefined)
              }
            >
              {t("تراخيص المكونات", "Component licenses")}
            </button>
            {notices && <pre>{notices}</pre>}
            <p>
              {t(
                "السوبر ماركت والمطاعم والملابس والأجهزة وحدات مستقبلية غير متاحة. لا محاسبة عامة متكاملة.",
                "Supermarket, restaurant, fashion and appliance modules are unavailable. Full general-ledger accounting is not included.",
              )}
            </p>
            <p>
              {t(
                "التحديث التلقائي والمزامنة معطلان حتى تجهيز خدمات موثوقة. إشعارات المكونات: docs/THIRD-PARTY-NOTICES.md.",
                "Automatic updates and sync are disabled pending trusted services. Component notices: docs/THIRD-PARTY-NOTICES.md.",
              )}
            </p>
            <div className="row">
              <button
                onClick={() => execute("companyLink", { name: "website" })}
              >
                {t("موقع الشركة والدعم", "Company & support")}
              </button>
              <button
                onClick={() => execute("companyLink", { name: "facebook" })}
              >
                Facebook
              </button>
            </div>
            <h2>{t("تغيير كلمة المرور", "Change password")}</h2>
            <Form
              busy={busy}
              submit={t("حفظ", "Save")}
              fields={[
                ["oldPassword", t("الحالية", "Current password"), "password"],
                ["newPassword", t("الجديدة", "New password"), "password"],
              ]}
              onSubmit={(v) => action("password", v)}
            />
          </>
        );
    }
  };
  return (
    <>
      {header}
      <div className="shell">
        <aside>
          <nav>
            {tabs.map(([id, label]) => (
              <button
                key={id}
                className={page === id ? "selected" : ""}
                onClick={() => setPage(id)}
              >
                {label}
              </button>
            ))}
          </nav>
          <small>
            {t("متجر عام · جهاز واحد", "General store · one device")}
            <br />
            v0.1.0
          </small>
        </aside>
        <main>
          {status}
          {!boot.license.active && (
            <div role="alert" className="error">
              {t(
                "الرخصة غير سارية — وضع القراءة",
                "License inactive — read mode",
              )}
            </div>
          )}
          {content()}
        </main>
      </div>
      {footer}
    </>
  );
}
createRoot(document.getElementById("root")!).render(<App />);
