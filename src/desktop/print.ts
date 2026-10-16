import { BrowserWindow } from "electron";
const escape = (v: unknown) =>
  String(v ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );
export interface PrintAdapter {
  print(document: any, lines: any[], business: string): Promise<void>;
}
export class WindowsPrintAdapter implements PrintAdapter {
  async print(doc: any, lines: any[], business: string) {
    const w = new BrowserWindow({
      show: false,
      webPreferences: {
        sandbox: true,
        contextIsolation: true,
        nodeIntegration: false,
      },
    });
    const money = (n: number) => (n / 100).toFixed(2);
    const html = `<!doctype html><html dir="rtl" lang="ar"><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'"><style>@page{size:80mm auto;margin:3mm}body{font:14px Arial;width:72mm}h1{font-size:20px}table{width:100%}td{padding:4px;border-bottom:1px dashed #888}.small{font-size:10px;overflow-wrap:anywhere}</style><h1>${escape(business)}</h1><h2>دعيدر فلو</h2><p>${escape(doc.kind)} — ${escape(doc.created)}</p><p class="small">${escape(doc.id)}</p><table><tr><th>الصنف</th><th>الكمية</th><th>القيمة</th></tr>${lines.map((l) => `<tr><td>${escape(l.name)}</td><td>${l.quantity / 1000}</td><td>${money(l.net)}</td></tr>`).join("")}</table><p>الإجمالي: ${money(doc.total)} جنيه</p><p>Developed by Daidar</p></html>`;
    try {
      await w.loadURL(
        "data:text/html;charset=utf-8," + encodeURIComponent(html),
      );
      await new Promise<void>((resolve, reject) =>
        w.webContents.print(
          {
            silent: false,
            printBackground: false,
            pageSize: { width: 80000, height: 200000 },
          },
          (ok, reason) =>
            ok ? resolve() : reject(new Error(reason || "ألغيت الطباعة")),
        ),
      );
    } finally {
      w.destroy();
    }
  }
}
