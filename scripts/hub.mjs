import { build } from "esbuild";
import { spawn } from "node:child_process";
await build({
  entryPoints: ["dev/hub.ts"],
  outfile: "test-results/hub.cjs",
  bundle: true,
  platform: "node",
  format: "cjs",
  target: "node24",
});
spawn(process.execPath, ["test-results/hub.cjs"], { stdio: "inherit" });
