import { config as loadEnv } from "dotenv";
import fs from "fs";
import path from "path";

const ENV_PATH = path.resolve(process.cwd(), ".env");

/** Load root `.env`. Override existing vars so a long-lived parent (Next) does not keep stale tokens. */
export function loadRootEnv(opts?: { override?: boolean }): void {
  const override = opts?.override !== false;
  const inheritedMode = process.env.MODE;
  loadEnv({ path: ENV_PATH, override });
  if (override && inheritedMode) process.env.MODE = inheritedMode;
}

/** Set or replace a KEY=value line in .env (creates file if missing). */
export function upsertEnvValues(values: Record<string, string>): void {
  let text = fs.existsSync(ENV_PATH) ? fs.readFileSync(ENV_PATH, "utf8") : "";
  if (text && !text.endsWith("\n")) text += "\n";

  for (const [key, value] of Object.entries(values)) {
    const line = `${key}=${value}`;
    const re = new RegExp(`^${key}=.*$`, "m");
    if (re.test(text)) {
      text = text.replace(re, line);
    } else {
      text += `${line}\n`;
    }
  }

  fs.writeFileSync(ENV_PATH, text, "utf8");
}

export function readEnvFileValue(key: string): string | null {
  if (!fs.existsSync(ENV_PATH)) return null;
  const text = fs.readFileSync(ENV_PATH, "utf8");
  const m = text.match(new RegExp(`^${key}=(.*)$`, "m"));
  return m?.[1]?.trim() || null;
}
