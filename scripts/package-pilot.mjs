import { spawnSync } from "node:child_process";
const build = spawnSync(process.execPath, ["scripts/build.mjs"], {
  stdio: "inherit",
  env: { ...process.env, DAIDAR_BUILD_PILOT: "1" },
});
if (build.status) process.exit(build.status);
const result = spawnSync(
  process.execPath,
  [
    "node_modules/electron-builder/cli.js",
    "--win",
    "nsis",
    "--config.extraMetadata.productName=Daidar Flow Pilot",
    "--config.appId=com.daidar.flow.pilot",
  ],
  {
    stdio: "inherit",
    env: { ...process.env, CSC_IDENTITY_AUTO_DISCOVERY: "false" },
  },
);
process.exit(result.status ?? 1);
