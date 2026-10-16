// Publish only the requested repository's pilot release. Credentials stay in memory.
import { spawnSync } from "node:child_process";
import { readFile, stat, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
const repo = "khaleddaidar012/daidar_flow",
  tag = "v0.1.0-pilot";
const remote = spawnSync("git", ["remote", "get-url", "origin"], {
  encoding: "utf8",
}).stdout.trim();
if (remote !== "https://github.com/" + repo + ".git")
  throw new Error("Unexpected Git remote");
const sha = spawnSync("git", ["rev-parse", "HEAD"], {
  encoding: "utf8",
}).stdout.trim();
let token = process.env.GH_TOKEN || process.env.GITHUB_TOKEN;
if (!token) {
  const result = spawnSync(
    "git",
    ["-c", "credential.interactive=never", "credential", "fill"],
    {
      encoding: "utf8",
      input: "url=https://github.com/" + repo + ".git\n\n",
      env: {
        ...process.env,
        GIT_TERMINAL_PROMPT: "0",
        GCM_INTERACTIVE: "Never",
      },
    },
  );
  token = result.stdout
    .split(/\r?\n/)
    .find((l) => l.startsWith("password="))
    ?.slice(9);
}
if (!token)
  throw new Error("No existing GitHub credential available for release upload");
const headers = {
  Authorization: "Bearer " + token,
  Accept: "application/vnd.github+json",
  "User-Agent": "Daidar-Flow-Release",
  "X-GitHub-Api-Version": "2022-11-28",
};
async function api(url, options = {}) {
  const target = new URL(url);
  if (
    !["api.github.com", "uploads.github.com"].includes(target.hostname) ||
    target.protocol !== "https:"
  )
    throw new Error("Unexpected API host");
  const r = await fetch(target, {
    ...options,
    headers: { ...headers, ...options.headers },
    redirect: "error",
    signal: AbortSignal.timeout(300000),
  });
  if (!r.ok) throw new Error("GitHub API status " + r.status);
  return r.status === 204 ? null : r.json();
}
const installer = "release/Daidar Flow Pilot Setup 0.1.0.exe";
const size = (await stat(installer)).size;
const digest = createHash("sha256")
  .update(await readFile(installer))
  .digest("hex");
await writeFile(
  "release/SHA256SUMS.txt",
  digest + "  Daidar Flow Pilot Setup 0.1.0.exe\n",
);
const lookup = await fetch(
  "https://api.github.com/repos/" + repo + "/releases/tags/" + tag,
  { headers, redirect: "error" },
);
let release;
if (lookup.ok) release = await lookup.json();
else if (lookup.status === 404)
  release = await api("https://api.github.com/repos/" + repo + "/releases", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      tag_name: tag,
      target_commitish: sha,
      name: "Daidar Flow 0.1.0 — Windows Pilot",
      prerelease: true,
      body:
        "نسخة تجريبية لمتجر عام، غير جاهزة للبيع. مثبت Windows x64 غير موقّع. التفعيل يتطلب محاكي التطوير المنفصل؛ لا بوابة هب تجارية متصلة.\n\n8 مجموعات اختبارات قواعد عمل وSQLite ناجحة، واختبار Electron للكاشير والباركود وF8 والمرتجع. الطباعة المادية وربط هب التجاري غير مختبرين.\n\nدليل التجربة: https://github.com/" +
        repo +
        "/blob/" +
        sha +
        "/docs/OPERATIONS.md\nنتائج وحدود القبول: https://github.com/" +
        repo +
        "/blob/" +
        sha +
        "/docs/ACCEPTANCE.md\n\nابدأ بتشغيل npm run dev:hub من المستودع، وشغّل التطبيق من طرفية جذر المستودع لمطابقة مفتاح المحاكي. لا تتضمن الملفات أي مفتاح توقيع خاص.\n\nCommit: " +
        sha,
    }),
  });
else throw new Error("GitHub release lookup status " + lookup.status);
for (const file of [installer, "release/SHA256SUMS.txt"]) {
  const name = file.split("/").at(-1);
  const existing = release.assets?.find((a) => a.name === name);
  if (existing && existing.state === "starter") {
    await api(
      "https://api.github.com/repos/" +
        repo +
        "/releases/assets/" +
        existing.id,
      { method: "DELETE" },
    );
  }
  if (existing && existing.state !== "starter") {
    if (name.endsWith(".exe") && existing.size !== size)
      throw new Error("Existing release asset has different size");
    continue;
  }
  const url = new URL(release.upload_url.split("{")[0]);
  url.searchParams.set("name", name);
  await api(url.href, {
    method: "POST",
    headers: {
      "content-type": name.endsWith(".exe")
        ? "application/octet-stream"
        : "text/plain",
      "content-length": String((await stat(file)).size),
    },
    body: await readFile(file),
    duplex: "half",
  });
}
console.log(
  JSON.stringify({
    release: release.html_url,
    tag,
    commit: sha,
    sha256: digest,
  }),
);
