// DEVELOPMENT ONLY: private key generated outside packaged application.
import { createServer } from "node:http";
import { generateKeyPairSync, randomUUID, sign } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
const dir = join(process.cwd(), "dev", "keys");
mkdirSync(dir, { recursive: true });
if (!existsSync(join(dir, "private.pem"))) {
  const k = generateKeyPairSync("ed25519");
  writeFileSync(
    join(dir, "private.pem"),
    k.privateKey.export({ type: "pkcs8", format: "pem" }),
    { mode: 0o600 },
  );
  writeFileSync(
    join(dir, "public.pem"),
    k.publicKey.export({ type: "spki", format: "pem" }),
  );
}
const key = readFileSync(join(dir, "private.pem"), "utf8");
const requests = new Map<
  string,
  { device: string; nonce: string; expires: number; approved: boolean }
>();
const bindings = new Map<string, { subscription: string; version: number }>();
let bound: string | undefined;
function license(device: string) {
  let b = bindings.get(device);
  if (!b) {
    b = { subscription: randomUUID(), version: 0 };
    bindings.set(device, b);
  }
  b.version++;
  const n = Date.now();
  const bytes = Buffer.from(
    JSON.stringify({
      kid: "dev-1",
      version: b.version,
      product: "daidar-flow",
      subscription: b.subscription,
      business: "dev-store",
      device,
      modules: ["general"],
      issuedAt: new Date(n).toISOString(),
      expiresAt: new Date(n + 30 * 86400000).toISOString(),
      offlineUntil: new Date(n + 30 * 86400000).toISOString(),
      graceSeconds: 0,
    }),
  );
  return {
    payload: bytes.toString("base64url"),
    signature: sign(null, bytes, key).toString("base64url"),
  };
}
createServer(async (req, res) => {
  try {
    if (req.headers.host !== "127.0.0.1:47831") throw new Error("invalid host");
    const u = new URL(req.url || "/", "http://127.0.0.1:47831");
    if (req.method === "GET" && u.pathname === "/approve") {
      const code = u.searchParams.get("code") || "",
        r = requests.get(code);
      if (!r || r.expires < Date.now()) throw new Error("expired");
      res.setHeader("content-type", "text/html; charset=utf-8");
      res.setHeader(
        "Content-Security-Policy",
        "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'",
      );
      res.end(
        `<!doctype html><html dir="rtl"><meta charset="utf-8"><title>محاكي هب</title><style>body{font:20px Arial;margin:80px;background:#eef6fb}button{font-size:20px;padding:20px}</style><h1>محاكي دعيدر هب — تطوير فقط</h1><p>لا دفع ولا حسابات عملاء. الموافقة تربط جهازًا واحدًا برخصة تجريبية موقعة لمدة30 يومًا.</p><form method="post" action="/approve"><input type="hidden" name="code" value="${code}"><input type="hidden" name="nonce" value="${r.nonce}"><button>موافقة على ربط الجهاز</button></form></html>`,
      );
      return;
    }
    let text = "";
    for await (const c of req) {
      text += c;
      if (text.length > 32768) throw new Error("too large");
    }
    if (req.method === "POST" && u.pathname === "/approve") {
      if (req.headers.origin !== "http://127.0.0.1:47831")
        throw new Error("origin");
      const f = new URLSearchParams(text),
        r = requests.get(f.get("code") || "");
      if (
        !r ||
        r.nonce !== f.get("nonce") ||
        r.expires < Date.now() ||
        r.approved
      )
        throw new Error("invalid");
      if (bound && bound !== r.device)
        throw new Error("second device requires approved transfer");
      bound = r.device;
      r.approved = true;
      res.setHeader("content-type", "text/html; charset=utf-8");
      res.end(
        '<html dir="rtl"><meta charset="utf-8"><h1>تمت الموافقة. ارجع إلى دعيدر فلو واضغط التحقق.</h1></html>',
      );
      return;
    }
    const p = JSON.parse(text || "{}");
    res.setHeader("content-type", "application/json");
    if (u.pathname === "/v1/device/authorize") {
      if (!/^[0-9a-f-]{36}$/.test(p.installation_id))
        throw new Error("invalid");
      const code = randomUUID();
      requests.set(code, {
        device: p.installation_id,
        nonce: randomUUID(),
        expires: Date.now() + 600000,
        approved: false,
      });
      res.end(
        JSON.stringify({
          device_code: code,
          verification_uri_complete:
            "http://127.0.0.1:47831/approve?code=" + code,
          interval: 2,
          expires_in: 600,
        }),
      );
      return;
    }
    if (u.pathname === "/v1/device/token") {
      const r = requests.get(p.device_code);
      if (!r || r.device !== p.installation_id || r.expires < Date.now())
        throw new Error("expired");
      if (!r.approved) {
        res.end(JSON.stringify({ status: "pending" }));
        return;
      }
      requests.delete(p.device_code);
      res.end(
        JSON.stringify({ status: "approved", license: license(r.device) }),
      );
      return;
    }
    if (u.pathname === "/v1/license/refresh") {
      if (p.installation_id !== bound) throw new Error("unbound");
      res.end(JSON.stringify(license(p.installation_id)));
      return;
    }
    res.statusCode = 404;
    res.end("{}");
  } catch (e) {
    res.statusCode = 400;
    res.end(JSON.stringify({ error: String(e) }));
  }
}).listen(47831, "127.0.0.1", () =>
  process.stdout.write("Development Hub: http://127.0.0.1:47831\n"),
);
