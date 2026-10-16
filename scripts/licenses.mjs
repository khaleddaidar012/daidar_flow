import { readFile, readdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
const rows = [];
const notices = [];
async function scan(dir) {
  for (const item of await readdir(dir, { withFileTypes: true })) {
    if (!item.isDirectory() || item.name.startsWith(".")) continue;
    const loc = join(dir, item.name);
    if (item.name.startsWith("@")) {
      await scan(loc);
      continue;
    }
    try {
      const p = JSON.parse(await readFile(join(loc, "package.json"), "utf8"));
      rows.push({
        name: p.name,
        version: p.version,
        license: p.license || "UNKNOWN",
        path: loc,
      });
      if (
        [
          "react",
          "react-dom",
          "zod",
          "@node-rs/argon2",
          "@node-rs/argon2-win32-x64-msvc",
          "electron",
        ].includes(p.name)
      ) {
        let found = false;
        for (const f of await readdir(loc)) {
          if (/^licen[sc]e/i.test(f)) {
            notices.push(
              "# " +
                p.name +
                " " +
                p.version +
                "\n\n" +
                (await readFile(join(loc, f), "utf8")),
            );
            found = true;
          }
        }
        if (!found)
          notices.push(
            "# " + p.name + " " + p.version + "\nLicense: " + p.license,
          );
      }
    } catch {}
    try {
      await scan(join(loc, "node_modules"));
    } catch {}
  }
}
await scan("node_modules");
rows.sort((a, b) => a.name.localeCompare(b.name));
await writeFile("docs/dependency-licenses.json", JSON.stringify(rows, null, 2));
await writeFile(
  "docs/THIRD-PARTY-NOTICES.md",
  "# Third-party notices\n\nDaidar Flow is proprietary. Dependency rights remain with their authors. Runtime: React MIT, Zod MIT, Argon2 MIT, Electron MIT. Electron ships its complete Chromium notices in LICENSES.chromium.html with the installed executable. Build tools are not product source. Review inventory before commercial distribution.\n\n" +
    notices.join("\n\n"),
);
console.log("Packages inspected:", rows.length);
console.log(
  "Copyleft/unknown:",
  rows
    .filter((p) => /GPL|UNKNOWN/.test(JSON.stringify(p.license)))
    .map((p) => p.name + ": " + p.license),
);
