import { build } from "esbuild";
import { mkdir } from "node:fs/promises";
import { spawnSync } from "node:child_process";
await mkdir("test-results", { recursive: true });
await build({
  entryPoints: ["tests/journey.test.ts"],
  outfile: "test-results/journey.test.cjs",
  bundle: true,
  platform: "node",
  format: "cjs",
  external: ["@node-rs/argon2"],
  target: "node24",
});
const r = spawnSync(
  process.execPath,
  ["--test", "test-results/journey.test.cjs"],
  { stdio: "inherit" },
);
process.exit(r.status ?? 1);
