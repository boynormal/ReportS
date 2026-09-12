/**
 * ดึง token อัตโนมัติ (npm run auth) แล้วรัน sync ต่อทันที
 *
 *   npm run sync:auto
 */

import { spawn } from "child_process";
import path from "path";
import { loadRootEnv } from "./lib/env-file.js";

function run(command: string, args: string[]): Promise<number> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: process.cwd(),
      stdio: "inherit",
      windowsHide: false,
    });
    child.on("error", reject);
    child.on("close", (code) => resolve(code ?? 1));
  });
}

async function main(): Promise<void> {
  loadRootEnv({ override: true });
  const tsx = path.resolve("node_modules/tsx/dist/cli.mjs");
  console.log("=== 1/2 รีเฟรช token จากเบราว์เซอร์ ===");
  const authCode = await run(process.execPath, [tsx, "src/refresh-tokens.ts"]);
  if (authCode !== 0) {
    process.exitCode = authCode;
    return;
  }

  loadRootEnv({ override: true });
  console.log("\n=== 2/2 รัน sync ===");
  const syncCode = await run(process.execPath, [tsx, "src/sync-to-postgres.ts"]);
  process.exitCode = syncCode;
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
