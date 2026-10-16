import { build } from "esbuild";
import { mkdir, copyFile, readFile } from "node:fs/promises";
await mkdir("dist/ui", { recursive: true });
const pilot = process.env.DAIDAR_BUILD_PILOT === "1";
const keys = pilot
  ? { "dev-1": await readFile("dev/keys/public.pem", "utf8") }
  : JSON.parse(process.env.DAIDAR_LICENSE_PUBLIC_KEYS || "{}");
await build({
  define: {
    BUILD_PILOT: JSON.stringify(pilot),
    BUILD_PUBLIC_KEYS: JSON.stringify(keys),
    BUILD_HUB_URL: JSON.stringify(process.env.DAIDAR_HUB_URL || ""),
  },
  entryPoints: ["src/desktop/main.ts"],
  outfile: "dist/desktop/main.js",
  bundle: true,
  platform: "node",
  format: "cjs",
  external: ["electron", "@node-rs/argon2"],
  target: "node24",
});
await build({
  entryPoints: ["src/desktop/preload.ts"],
  outfile: "dist/desktop/preload.js",
  bundle: true,
  platform: "node",
  format: "cjs",
  external: ["electron"],
  target: "node24",
});
await build({
  entryPoints: ["src/ui/app.tsx"],
  outfile: "dist/ui/app.js",
  bundle: true,
  platform: "browser",
  format: "iife",
  target: "chrome148",
  minify: true,
});
await copyFile("src/ui/index.html", "dist/ui/index.html");
