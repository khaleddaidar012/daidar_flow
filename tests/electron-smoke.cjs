const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const path = require("node:path");
const { randomUUID } = require("node:crypto");
module.exports = async ({ win, store, license, hub }) => {
  const checks = [];
  const delay = (ms) => new Promise((r) => setTimeout(r, ms));
  const wait = async (fn) => {
    for (let i = 0; i < 100; i++) {
      if (await fn()) return;
      await delay(50);
    }
    throw new Error("UI wait timeout");
  };
  const js = (source) => win.webContents.executeJavaScript(source);
  const invoke = async (command, payload = {}) => {
    const r = await js(
      "window.flow.invoke(" +
        JSON.stringify(command) +
        "," +
        JSON.stringify(payload) +
        ")",
    );
    assert.equal(r.ok, true, r.error);
    return r.data;
  };
  const reload = async () => {
    win.webContents.reload();
    await new Promise((r) => win.webContents.once("did-finish-load", r));
    await wait(() => js("!!document.querySelector('main h1')"));
  };
  if (!store.one("SELECT id FROM users LIMIT 1")) {
    const auth = await hub.start();
    const page = await (await fetch(auth.verification_uri_complete)).text();
    const nonce = /name="nonce" value="([^"]+)"/.exec(page)[1];
    const code = new URL(auth.verification_uri_complete).searchParams.get(
      "code",
    );
    const approved = await fetch("http://127.0.0.1:47831/approve", {
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        origin: "http://127.0.0.1:47831",
      },
      body: new URLSearchParams({ code, nonce }),
    });
    assert.equal(approved.ok, true);
    const poll = await hub.poll();
    assert.equal(poll.status, "approved");
    license.accept(poll.license);
    checks.push("browser consent simulator + signed device activation");
    await reload();
    await js(
      `for(const [n,v] of Object.entries({business:'متجر رحلة Electron',username:'desktop-admin',password:'desktop-test-password'}))document.querySelector('[name="'+n+'"]').value=v;document.querySelector('form').requestSubmit();`,
    );
    await wait(() => !!store.one("SELECT id FROM users LIMIT 1"));
    checks.push("React manager setup form -> IPC -> Argon2id");
  }
  await reload();
  if (!store.session) {
    await js(
      `document.querySelector('[name="username"]').value='desktop-admin';document.querySelector('[name="password"]').value='desktop-test-password';document.querySelector('form').requestSubmit();`,
    );
    await wait(() => !!store.session);
    await wait(() => js("document.querySelectorAll('nav button').length>5"));
    checks.push("React local login");
  }
  const employee = await invoke("userCreate", {
    username: "desktop-cashier-" + Date.now(),
    password: "temporary-password-1",
    role: "cashier",
  });
  assert.ok(employee.id);
  checks.push("limited employee persisted");
  const product = await invoke("productCreate", {
    name: "صنف رحلة Electron " + Date.now(),
    barcode: "UI-" + Date.now(),
    category: "عام",
    baseUnit: "قطعة",
    packName: "كرتونة",
    packFactor: 12000,
    retail: 2000,
    wholesale: 1500,
    purchase: 1000,
    reorder: 2000,
  });
  const supplier = await invoke("partyCreate", {
    name: "مورد اختبار Electron",
    kind: "supplier",
    opening: 0,
    creditLimit: 0,
    reason: "رحلة قبول",
  });
  await invoke("purchase", {
    operationId: randomUUID(),
    partyId: supplier.id,
    lines: [
      { productId: product.id, quantity: 1000, unit: "pack", price: 12000 },
    ],
    payments: [],
  });
  checks.push("purchase pack 12 through sandbox preload");
  await invoke("shiftOpen", { operationId: randomUUID(), float: 10000 });
  await reload();
  await js(
    `Array.from(document.querySelectorAll('nav button')).find(b=>b.textContent==='الكاشير').click()`,
  );
  await wait(() => js("!!document.querySelector('.product-grid')"));
  // Simulate keyboard-wedge scan in the actual React search field; no physical scanner claim.
  const barcode = store.product(product.id).barcode;
  await js(
    `const scan=document.querySelector('.pos section input');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(scan,${JSON.stringify(barcode)});scan.dispatchEvent(new Event('input',{bubbles:true}));`,
  );
  await delay(100);
  await js(
    `document.querySelector('.pos section input').dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true}));`,
  );
  await wait(() => js("document.querySelectorAll('.cart-line').length===1"));
  await js(
    `Array.from(document.querySelectorAll('.cart button')).find(b=>b.textContent==='الباقي نقدي').click()`,
  );
  await js(
    "window.dispatchEvent(new KeyboardEvent('keydown',{key:'F8',bubbles:true}))",
  );
  await wait(
    () =>
      !!store.one(
        "SELECT l.id FROM lines l JOIN documents d ON d.id=l.document WHERE d.kind='sale' AND l.product=?",
        product.id,
      ),
  );
  const sale = store.one(
    "SELECT d.* FROM documents d JOIN lines l ON l.document=d.id WHERE d.kind='sale' AND l.product='" +
      product.id +
      "' ORDER BY created DESC LIMIT 1",
  );
  assert.equal(sale.total, 2000);
  assert.equal(sale.cost, 1000);
  checks.push("React keyboard-wedge barcode Enter, cash fill, F8 sale commit");
  const line = store.one("SELECT * FROM lines WHERE document=?", sale.id);
  await invoke("return", {
    operationId: randomUUID(),
    documentId: sale.id,
    lines: [{ lineId: line.id, quantity: 500 }],
    method: "cash",
    reason: "مرتجع نصف قطعة اختبار",
  });
  await invoke("shiftClose", {
    operationId: randomUUID(),
    actual: 11000,
    reason: "",
  });
  checks.push("linked partial return and cash closure");
  const report = await invoke("report", {
    from: new Date().toISOString().slice(0, 10),
    to: new Date().toISOString().slice(0, 10),
  });
  assert.ok(report.summary.sales - report.summary.cost >= 500);
  checks.push("actual report gross profit");
  await store.backup(path.resolve("test-results/electron-backup.sqlite"));
  checks.push("Electron node:sqlite backup API");
  await reload();
  await js(
    `Array.from(document.querySelectorAll('header button')).find(b=>b.textContent==='English').click()`,
  );
  await wait(() => js("document.documentElement.dir==='ltr'"));
  checks.push("English LTR toggle");
  await fs.writeFile(
    "test-results/pos.png",
    (await win.webContents.capturePage()).toPNG(),
  );
  await js(
    `Array.from(document.querySelectorAll('nav button')).find(b=>b.textContent==='Overview').click()`,
  );
  await delay(200);
  await fs.writeFile(
    "test-results/overview.png",
    (await win.webContents.capturePage()).toPNG(),
  );
  await fs.writeFile(
    "test-results/electron-smoke.json",
    JSON.stringify(
      {
        passed: true,
        node: process.versions.node,
        checks,
        printing: "not attempted: physical printer unavailable",
      },
      null,
      2,
    ),
  );
};
