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
if (process.argv.includes("--draft-failed")) {
  for (const asset of release.assets || []) {
    if (
      asset.state === "starter" &&
      (asset.name === installer.split("/").at(-1) ||
        /^DaidarFlowPilot-0\.1\.0\.exe\.part[0-9]+$/.test(asset.name))
    )
      await api(
        "https://api.github.com/repos/" + repo + "/releases/assets/" + asset.id,
        { method: "DELETE" },
      );
  }
  const updated = await api(
    "https://api.github.com/repos/" + repo + "/releases/" + release.id,
    {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        draft: true,
        body:
          release.body +
          "\n\nتعذر رفع المثبت بسبب HTTP408 حتى مع التجزئة. بقيت هذه المسودة للمراجعة؛ المثبت الكامل وبصمةSHA256 متوفران في بيئة التطوير المحلية.",
      }),
    },
  );
  console.log(
    JSON.stringify({
      release: updated.html_url,
      draft: updated.draft,
      upload: "HTTP408",
    }),
  );
  process.exit(0);
}
let assets = [installer, "release/SHA256SUMS.txt"];
if (process.argv.includes("--parts")) {
  const data = await readFile(installer);
  const names = [];
  for (
    let offset = 0, index = 1;
    offset < data.length;
    offset += 25 * 1024 * 1024, index++
  ) {
    const name =
      "DaidarFlowPilot-0.1.0.exe.part" + String(index).padStart(3, "0");
    await writeFile(
      "release/" + name,
      data.subarray(offset, Math.min(data.length, offset + 25 * 1024 * 1024)),
    );
    names.push(name);
  }
  const assemble = [
    "$ErrorActionPreference='Stop'",
    "$taskOutput=Join-Path $PSScriptRoot 'Daidar Flow Pilot Setup 0.1.0.exe'",
    "$taskParts=@(" + names.map((n) => "'" + n + "'").join(",") + ")",
    "foreach($taskName in $taskParts){if(-not(Test-Path -LiteralPath (Join-Path $PSScriptRoot $taskName))){throw ('Missing '+$taskName)}}",
    "$taskStream=[System.IO.File]::Open($taskOutput,[System.IO.FileMode]::CreateNew)",
    "try{foreach($taskName in $taskParts){$taskInput=[System.IO.File]::OpenRead((Join-Path $PSScriptRoot $taskName));try{$taskInput.CopyTo($taskStream)}finally{$taskInput.Dispose()}}}finally{$taskStream.Dispose()}",
    "if((Get-FileHash -LiteralPath $taskOutput -Algorithm SHA256).Hash.ToLowerInvariant() -ne '" +
      digest +
      "'){throw 'SHA256 mismatch. Do not run this file.'}",
    "Write-Output ('Verified installer: '+$taskOutput)",
  ].join("\r\n");
  await writeFile("release/Assemble-installer.ps1", assemble);
  const failed = release.assets?.find(
    (a) => a.name === installer.split("/").at(-1) && a.state === "starter",
  );
  if (failed)
    await api(
      "https://api.github.com/repos/" + repo + "/releases/assets/" + failed.id,
      { method: "DELETE" },
    );
  assets = [
    ...names.map((n) => "release/" + n),
    "release/Assemble-installer.ps1",
    "release/SHA256SUMS.txt",
  ];
}
for (const file of assets) {
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
    if (existing.size !== (await stat(file)).size)
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
if (process.argv.includes("--parts")) {
  await api(
    "https://api.github.com/repos/" + repo + "/releases/" + release.id,
    {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        body:
          release.body +
          "\n\nتنزيل المثبت: تعذر رفع الملف الكبير كاملًا بسبب مهلة408. نزّل ملفاتpart001 إلىpart004 وAssemble-installer.ps1 في مجلد واحد، ثم شغّل السكربت لتجميع المثبت والتحقق منSHA256. لا يفتح السكربت المثبت تلقائيًا. المثبت غير موقّع وغير جاهز للبيع.",
      }),
    },
  );
}
console.log(
  JSON.stringify({
    release: release.html_url,
    tag,
    commit: sha,
    sha256: digest,
  }),
);
