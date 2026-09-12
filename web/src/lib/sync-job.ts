import { spawn } from "child_process";
import { existsSync } from "fs";
import { resolve } from "path";

/** Cover Chrome auth (up to ~5 min) before incremental sync writes sync_runs. */
export const AUTH_SYNC_LOCK_MS = 6 * 60 * 1000;

let startLockUntil = 0;

export function isSyncStarting(): boolean {
  return Date.now() < startLockUntil;
}

export function markSyncStarting(ms = AUTH_SYNC_LOCK_MS): void {
  startLockUntil = Date.now() + ms;
}

export function clearSyncStarting(): void {
  startLockUntil = 0;
}

export function repoRoot(): string {
  const cwd = process.cwd();
  if (existsSync(resolve(cwd, "src/sync-to-postgres.ts"))) return cwd;
  const parent = resolve(cwd, "..");
  if (existsSync(resolve(parent, "src/sync-to-postgres.ts"))) return parent;
  throw new Error("หาโฟลเดอร์รากที่มี src/sync-to-postgres.ts ไม่เจอ");
}

const CHILD_ENV_KEYS = [
  "PATH",
  "Path",
  "SystemRoot",
  "SYSTEMROOT",
  "SystemDrive",
  "WINDIR",
  "windir",
  "TEMP",
  "TMP",
  "USERPROFILE",
  "HOMEDRIVE",
  "HOMEPATH",
  "APPDATA",
  "LOCALAPPDATA",
  "COMSPEC",
  "PATHEXT",
  "USERNAME",
  "USERDOMAIN",
  "COMPUTERNAME",
] as const;

function childEnv(): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { NODE_ENV: process.env.NODE_ENV ?? "production" };
  for (const key of CHILD_ENV_KEYS) {
    const value = process.env[key];
    if (value) env[key] = value;
  }
  env.MODE = "incremental";
  return env;
}

/** Same path as `npm run sync:auto`: refresh tokens then incremental sync. */
export function startIncrementalSync(): Promise<void> {
  const root = repoRoot();
  const tsx = resolve(root, "node_modules/tsx/dist/cli.mjs");
  if (!existsSync(tsx)) {
    throw new Error("ไม่พบ tsx ในโฟลเดอร์ราก — รัน npm install ที่รากโปรเจกต์ก่อน");
  }
  return new Promise((resolveReady, reject) => {
    const child = spawn(process.execPath, [tsx, "src/sync-with-auth.ts"], {
      cwd: root,
      env: childEnv(),
      detached: true,
      stdio: "ignore",
      windowsHide: false,
    });
    child.once("error", (err) => {
      reject(new Error(`เริ่ม sync ไม่ได้: ${err.message}`));
    });
    const ready = () => {
      child.unref();
      resolveReady();
    };
    if (child.pid) ready();
    else child.once("spawn", ready);
  });
}
