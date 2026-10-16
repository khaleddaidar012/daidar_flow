declare const BUILD_PILOT: boolean;
declare const BUILD_PUBLIC_KEYS: Record<string, string>;
declare const BUILD_HUB_URL: string;
import {
  app,
  BrowserWindow,
  ipcMain,
  dialog,
  shell,
  safeStorage,
  session,
} from "electron";
import { randomUUID } from "node:crypto";
import {
  existsSync,
  readFileSync,
  writeFileSync,
  mkdirSync,
  renameSync,
} from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { Store } from "../core/store";
import { License, type SecureState } from "../core/license";
import { HubConnector } from "../core/hub";
import { schemas, company, type Command } from "../core/contracts";
import { WindowsPrintAdapter } from "./print";
let store: Store,
  win: BrowserWindow,
  license: License,
  hub: HubConnector | undefined;
let bootstrapAudited = false;
let importRows: any[] | undefined,
  serial: Promise<any> = Promise.resolve();
app.setName(BUILD_PILOT ? "Daidar Flow Pilot" : "Daidar Flow");
if (!app.isPackaged && process.env.DAIDAR_SMOKE === "1") {
  const testRoot = resolve("test-results/electron-userdata");
  mkdirSync(testRoot, { recursive: true });
  app.setPath("userData", testRoot);
}
if (!app.requestSingleInstanceLock()) app.quit();
else
  app
    .whenReady()
    .then(async () => {
      const root = app.getPath("userData");
      mkdirSync(root, { recursive: true });
      mkdirSync(join(root, "backups"), { recursive: true });
      const devicePath = join(root, "installation-id");
      if (!existsSync(devicePath)) writeFileSync(devicePath, randomUUID());
      const device = readFileSync(devicePath, "utf8").trim();
      if (!safeStorage.isEncryptionAvailable()) {
        dialog.showErrorBox(
          "Daidar Flow",
          "Windows secure storage unavailable.",
        );
        app.quit();
        return;
      }
      const statePath = join(root, "license.secure");
      const state: SecureState = {
        load: () =>
          existsSync(statePath)
            ? JSON.parse(safeStorage.decryptString(readFileSync(statePath)))
            : {},
        save: (v) => {
          writeFileSync(
            statePath + ".tmp",
            safeStorage.encryptString(JSON.stringify(v)),
          );
          renameSync(statePath + ".tmp", statePath);
        },
      };
      const development =
        BUILD_PILOT || (!app.isPackaged && process.env.DAIDAR_DEV_HUB === "1");
      const keys = {
        ...BUILD_PUBLIC_KEYS,
        ...(!app.isPackaged && process.env.DAIDAR_LICENSE_PUBLIC_KEYS
          ? JSON.parse(process.env.DAIDAR_LICENSE_PUBLIC_KEYS)
          : {}),
      };
      if (development) {
        const p = resolve("dev/keys/public.pem");
        if (existsSync(p)) keys["dev-1"] = readFileSync(p, "utf8");
      }
      license = new License(device, keys, state);
      const hubUrl = development
        ? "http://127.0.0.1:47831"
        : BUILD_HUB_URL ||
          (!app.isPackaged ? process.env.DAIDAR_HUB_URL : undefined);
      if (hubUrl) hub = new HubConnector(hubUrl, device, development);
      store = new Store(join(root, "flow.sqlite"), license);
      const uiUrl = pathToFileURL(join(__dirname, "../ui/index.html")).href;
      win = new BrowserWindow({
        width: 1400,
        height: 920,
        minWidth: 1050,
        minHeight: 700,
        icon: join(app.getAppPath(), "public/icon.png"),
        webPreferences: {
          preload: join(__dirname, "preload.js"),
          contextIsolation: true,
          nodeIntegration: false,
          sandbox: true,
          webSecurity: true,
        },
      });
      win.setMenuBarVisibility(false);
      win.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
      win.webContents.on("will-navigate", (e, url) => {
        if (url !== uiUrl) e.preventDefault();
      });
      session.defaultSession.setPermissionRequestHandler(
        (_wc, _permission, callback) => callback(false),
      );
      ipcMain.handle(
        "flow:command",
        (event, command: Command, payload: unknown) => {
          if (
            event.sender !== win.webContents ||
            event.senderFrame !== win.webContents.mainFrame ||
            event.senderFrame.url !== uiUrl
          )
            throw new Error("Untrusted IPC");
          const work = serial.then(async () => {
            if (!Object.hasOwn(schemas, command))
              throw new Error("Unknown command");
            const p: any = schemas[command].parse(payload);
            switch (command) {
              case "bootstrap":
                if (!bootstrapAudited) {
                  store.audit(
                    "application-ready",
                    JSON.stringify({
                      version: app.getVersion(),
                      packaged: app.isPackaged,
                    }),
                  );
                  bootstrapAudited = true;
                }
                return {
                  ...(await store.execute("bootstrap", {})),
                  pilot: development,
                };
              case "activateStart": {
                if (!hub)
                  throw new Error(
                    "بوابة هب غير مهيأة. راجع دليل إعداد الخدمة.",
                  );
                const r = await hub.start();
                await shell.openExternal(r.verification_uri_complete);
                return { development, ...r };
              }
              case "activatePoll": {
                if (!hub) throw new Error("هب غير مهيأ");
                const r = await hub.poll();
                if (r.status === "approved") license.accept(r.license);
                return r;
              }
              case "licenseRefresh": {
                if (!hub || !license.envelope)
                  throw new Error("هب أو الرخصة غير متاحين");
                return license.accept(await hub.renew(license.envelope));
              }
              case "licenseImport": {
                const f = await dialog.showOpenDialog(win, {
                  filters: [{ name: "Signed license", extensions: ["json"] }],
                  properties: ["openFile"],
                });
                if (f.canceled) return { cancelled: true };
                return license.accept(
                  JSON.parse(readFileSync(f.filePaths[0], "utf8")),
                );
              }
              case "backup": {
                store.auth("backup", false);
                const f = await dialog.showSaveDialog(win, {
                  defaultPath: join(
                    root,
                    "backups",
                    "flow-" + Date.now() + ".sqlite",
                  ),
                  filters: [{ name: "SQLite backup", extensions: ["sqlite"] }],
                });
                if (f.canceled) return { cancelled: true };
                return store.backup(f.filePath!);
              }
              case "restore": {
                store.auth("restore", false);
                const f = await dialog.showOpenDialog(win, {
                  filters: [{ name: "SQLite backup", extensions: ["sqlite"] }],
                  properties: ["openFile"],
                });
                if (f.canceled) return { cancelled: true };
                if (resolve(f.filePaths[0]) === resolve(store.path))
                  throw new Error("اختر نسخة منفصلة");
                return store.restore(
                  f.filePaths[0],
                  join(
                    root,
                    "backups",
                    "before-restore-" + Date.now() + ".sqlite",
                  ),
                  p.managerPassword,
                  p.reason,
                );
              }
              case "export": {
                store.auth("export", false);
                const f = await dialog.showSaveDialog(win, {
                  defaultPath: "daidar-export.json",
                });
                if (f.canceled) return { cancelled: true };
                writeFileSync(
                  f.filePath!,
                  JSON.stringify(store.exportData(), null, 2),
                );
                store.audit("export", "schema-2");
                return {};
              }
              case "print": {
                store.auth("print", false);
                const doc = store.one(
                  "SELECT * FROM documents WHERE id=?",
                  p.documentId,
                );
                if (!doc) throw new Error("الفاتورة غير موجودة");
                const count = store.one(
                  "SELECT COUNT(*) n FROM audit WHERE action='print-success' AND subject=?",
                  doc.id,
                )!.n;
                if (count && p.reason.length < 3)
                  throw new Error("سبب إعادة الطباعة مطلوب");
                store.audit("print-request", doc.id);
                if (p.reason)
                  store.audit(
                    "print-reason",
                    JSON.stringify({ documentId: doc.id, reason: p.reason }),
                  );
                await new WindowsPrintAdapter().print(
                  doc,
                  store.all(
                    "SELECT l.*,l.product_name AS name FROM lines l WHERE document=?",
                    doc.id,
                  ),
                  store.one("SELECT value FROM settings WHERE key='business'")
                    ?.value || "",
                );
                store.audit("print-success", doc.id);
                return {};
              }
              case "notices":
                return readFileSync(
                  join(app.getAppPath(), "docs/THIRD-PARTY-NOTICES.md"),
                  "utf8",
                );
              case "companyLink":
                await shell.openExternal(
                  company[p.name as keyof typeof company],
                );
                return {};
              case "productExport": {
                store.auth("export", false);
                const f = await dialog.showSaveDialog(win, {
                  defaultPath: "products.json",
                });
                if (f.canceled) return { cancelled: true };
                const rows = store.all("SELECT * FROM products").map((r) => ({
                  name: r.name,
                  barcode: r.barcode,
                  category: r.category,
                  baseUnit: r.base_unit,
                  packName: r.pack_name,
                  packFactor: r.pack_factor,
                  retail: r.retail,
                  wholesale: r.wholesale,
                  purchase: r.purchase,
                  reorder: r.reorder,
                }));
                writeFileSync(f.filePath!, JSON.stringify(rows, null, 2));
                store.audit("product-export", String(rows.length));
                return {};
              }
              case "importPreview": {
                store.auth("products");
                const f = await dialog.showOpenDialog(win, {
                  filters: [{ name: "Products JSON", extensions: ["json"] }],
                  properties: ["openFile"],
                });
                if (f.canceled) return { cancelled: true };
                const input = JSON.parse(readFileSync(f.filePaths[0], "utf8"));
                if (!Array.isArray(input) || input.length > 10000)
                  throw new Error("مطلوب مصفوفة بحد10000");
                const errors: any[] = [];
                const rows = input.map((r, i) => {
                  const parsed = schemas.productCreate.safeParse(r);
                  if (!parsed.success) {
                    errors.push({ row: i + 1, error: parsed.error.message });
                    return null;
                  }
                  if (
                    store.one(
                      "SELECT id FROM products WHERE barcode=?",
                      r.barcode,
                    ) ||
                    input.slice(0, i).some((x: any) => x.barcode === r.barcode)
                  )
                    errors.push({ row: i + 1, error: "باركود مكرر" });
                  return parsed.data;
                });
                importRows = errors.length ? undefined : rows;
                return { rows: rows.slice(0, 100), total: rows.length, errors };
              }
              case "importCommit": {
                store.auth("products");
                if (!importRows) throw new Error("نفذ معاينة سليمة أولًا");
                const rows = importRows;
                importRows = undefined;
                store.transaction(() => {
                  for (const p of rows)
                    store.run(
                      "INSERT INTO products(id,name,barcode,category,base_unit,pack_name,pack_factor,retail,wholesale,purchase,reorder) VALUES(?,?,?,?,?,?,?,?,?,?,?)",
                      randomUUID(),
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
                  store.audit("product-import", String(rows.length));
                });
                return { count: rows.length };
              }
              default:
                return store.execute(command, p);
            }
          });
          serial = work.catch(() => undefined);
          return work
            .then((data) => ({ ok: true, data }))
            .catch((e: unknown) => ({
              ok: false,
              error: e instanceof Error ? e.message : "تعذر تنفيذ العملية",
            }));
        },
      );
      await win.loadURL(uiUrl);
      const autoBackup = async () => {
        if (store.busy) return;
        const date = new Date().toISOString().slice(0, 10),
          file = join(root, "backups", "daily-" + date + ".sqlite");
        if (!existsSync(file)) {
          const { backup } = await import("node:sqlite");
          await backup(store.db, file);
        }
      };
      await autoBackup();
      const timer = setInterval(() => {
        serial = serial.then(autoBackup).catch(() => undefined);
      }, 3600000);
      timer.unref();
      let quitting = false;
      app.on("before-quit", (event) => {
        if (quitting) return;
        event.preventDefault();
        clearInterval(timer);
        quitting = true;
        serial.finally(() => {
          license.persist();
          store.close();
          app.quit();
        });
      });
      if (process.env.DAIDAR_SMOKE === "1" && !app.isPackaged) {
        try {
          await require(resolve("tests/electron-smoke.cjs"))({
            win,
            store,
            license,
            hub,
            root,
          });
        } catch (e) {
          writeFileSync(
            resolve("test-results/electron-smoke.json"),
            JSON.stringify({ error: String(e), stack: (e as Error).stack }),
          );
        } finally {
          app.quit();
        }
      }
    })
    .catch((e) => {
      dialog.showErrorBox("Daidar Flow", String(e));
      app.quit();
    });
app.on("window-all-closed", () => app.quit());
