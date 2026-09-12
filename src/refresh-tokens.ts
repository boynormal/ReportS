/**
 * เปิดเบราว์เซอร์ Scrapee แล้วดึง SCRAPEE_ID_TOKEN + FIREBASE_APP_CHECK_TOKEN
 *
 *   npm run auth
 *
 * อยู่หน้า login: กรอกเองหรือใส่ SCRAPEE_PASSWORD ใน .env ให้ช่วยกรอก
 * สคริปต์จะไม่รีโหลดตอนอยู่หน้า login (กันฟอร์มถูกล้าง)
 */

import fs from "fs";
import path from "path";
import {
  chromium,
  type BrowserContext,
  type Page,
  type Request,
  type Response,
} from "playwright";
import { loadRootEnv, upsertEnvValues } from "./lib/env-file.js";

loadRootEnv({ override: true });

const AUTH_DIR = path.resolve(process.cwd(), ".auth");
const STORAGE_PATH = path.join(AUTH_DIR, "scrapee.json");
const START_URL = process.env.SCRAPEE_APP_URL?.trim() || "https://scrapee.app/dashboard";
const TIMEOUT_MS = Number(process.env.AUTH_TIMEOUT_MS ?? 300_000);

function keepAuthSession(): boolean {
  return process.env.AUTH_KEEP_SESSION !== "0";
}

type Captured = {
  idToken: string | null;
  appCheckToken: string | null;
  refreshToken: string | null;
};

function looksLikeJwt(value: string | null | undefined): value is string {
  return Boolean(value && value.startsWith("eyJ") && value.split(".").length >= 3);
}

function isFirebaseIdToken(token: string): boolean {
  try {
    const payload = JSON.parse(
      Buffer.from(token.split(".")[1]!, "base64url").toString("utf8")
    ) as { aud?: string; companyId?: string; user_id?: string };
    return payload.aud === "scrappy-prod" || Boolean(payload.companyId && payload.user_id);
  } catch {
    return false;
  }
}

function isAppCheckToken(token: string): boolean {
  try {
    const payload = JSON.parse(
      Buffer.from(token.split(".")[1]!, "base64url").toString("utf8")
    ) as { iss?: string; provider?: string };
    return Boolean(
      payload.iss?.includes("firebaseappcheck") || payload.provider?.includes("recaptcha")
    );
  } catch {
    return false;
  }
}

function absorbJwt(token: string, captured: Captured): void {
  if (!looksLikeJwt(token)) return;
  if (!captured.idToken && isFirebaseIdToken(token)) {
    captured.idToken = token;
    console.log("ได้ idToken");
  }
  if (!captured.appCheckToken && isAppCheckToken(token)) {
    captured.appCheckToken = token;
    console.log("ได้ App Check token");
  }
}

function absorbFromRequest(req: Request, captured: Captured): void {
  const headers = req.headers();
  const appCheck = headers["x-firebase-appcheck"];
  if (appCheck) absorbJwt(appCheck, captured);

  const auth = headers["authorization"];
  if (auth?.toLowerCase().startsWith("bearer ")) {
    absorbJwt(auth.slice(7).trim(), captured);
  }

  const post = req.postData();
  if (!post) return;
  try {
    const json = JSON.parse(post) as { idToken?: string };
    if (json.idToken) absorbJwt(json.idToken, captured);
  } catch {
    /* not json */
  }
}

async function absorbFromResponse(res: Response, captured: Captured): Promise<void> {
  const url = res.url();
  if (res.status() < 200 || res.status() >= 300) return;

  const interesting =
    url.includes("exchangeRecaptchaEnterpriseToken") ||
    url.includes("identitytoolkit.googleapis.com") ||
    url.includes("securetoken.googleapis.com") ||
    url.includes("firebaseappcheck");

  if (!interesting) return;

  try {
    const json = (await res.json()) as Record<string, unknown>;

    // App Check exchange response: { token: "eyJ..." }
    if (typeof json.token === "string") absorbJwt(json.token, captured);

    // Auth sign-in / lookup
    if (typeof json.idToken === "string") absorbJwt(json.idToken, captured);
    if (typeof json.refreshToken === "string") {
      captured.refreshToken = json.refreshToken;
      console.log("ได้ refreshToken");
    }

    // securetoken refresh response
    if (typeof json.id_token === "string") absorbJwt(json.id_token, captured);
    if (typeof json.refresh_token === "string") {
      captured.refreshToken = json.refresh_token;
    }
  } catch {
    /* ignore non-json */
  }
}

async function tryAutoLogin(page: Page): Promise<void> {
  const email = process.env.SCRAPEE_EMAIL?.trim();
  const password = process.env.SCRAPEE_PASSWORD?.trim();
  if (!email || !password) {
    console.log(
      "ยังไม่มี SCRAPEE_PASSWORD ใน .env — กรุณากรอกอีเมล/รหัสในหน้าต่างเบราว์เซอร์เอง แล้วกด Submit"
    );
    console.log(`ใช้บัญชีจริง เช่น ${email || "may.cashier@scharoenchai.com"} (ไม่ใช่ john@scrappy.com)`);
    return;
  }

  console.log(`พยายาม login อัตโนมัติด้วย ${email} ...`);
  await new Promise((r) => setTimeout(r, 1500));

  const emailBox = page
    .locator('input[type="email"], input[name="email"], input[autocomplete="username"]')
    .first();
  const passBox = page
    .locator('input[type="password"], input[name="password"], input[autocomplete="current-password"]')
    .first();

  if ((await emailBox.count()) === 0 || (await passBox.count()) === 0) {
    console.log("หาช่องอีเมล/รหัสไม่เจอ — กรอกเองในเบราว์เซอร์");
    return;
  }

  await emailBox.fill("");
  await emailBox.fill(email);
  await passBox.fill("");
  await passBox.fill(password);

  const submit = page.getByRole("button", { name: /submit|เข้าสู่ระบบ|login/i }).first();
  if ((await submit.count()) > 0) {
    await submit.click();
  } else {
    await passBox.press("Enter");
  }
  console.log("กด Submit แล้ว — รอเข้า dashboard (ถ้ามี captcha ให้ทำในหน้าต่างนั้น)");
}

async function tryReadIdTokenFromIndexedDb(page: Page): Promise<string | null> {
  try {
    return await page.evaluate(async () => {
      const dbs = await indexedDB.databases();
      for (const info of dbs) {
        if (!info.name) continue;
        const db = await new Promise<IDBDatabase>((resolve, reject) => {
          const req = indexedDB.open(info.name!);
          req.onsuccess = () => resolve(req.result);
          req.onerror = () => reject(req.error);
        });
        try {
          for (const storeName of Array.from(db.objectStoreNames)) {
            const rows = await new Promise<unknown[]>((resolve, reject) => {
              const tx = db.transaction(storeName, "readonly");
              const req = tx.objectStore(storeName).getAll();
              req.onsuccess = () => resolve(req.result as unknown[]);
              req.onerror = () => reject(req.error);
            });
            const text = JSON.stringify(rows);
            const m = text.match(/"accessToken":"(eyJ[^"]+)"/);
            if (m?.[1]) return m[1];
          }
        } finally {
          db.close();
        }
      }
      return null;
    });
  } catch {
    return null;
  }
}

function isLoginUrl(url: string): boolean {
  return /\/login|\/signin|\/sign-in/i.test(url);
}

async function launchContext(): Promise<{
  browser: Awaited<ReturnType<typeof chromium.launch>>;
  context: BrowserContext;
}> {
  if (!keepAuthSession() && fs.existsSync(STORAGE_PATH)) {
    fs.unlinkSync(STORAGE_PATH);
    console.log("ลบ .auth/scrapee.json เก่า (AUTH_KEEP_SESSION=0)");
  }

  const storageState = keepAuthSession() && fs.existsSync(STORAGE_PATH) ? STORAGE_PATH : undefined;
  if (storageState) console.log("ใช้ session ที่บันทึกไว้ → .auth/scrapee.json");

  const preferred = process.env.PLAYWRIGHT_CHANNEL?.trim() || "chrome";
  const contextOpts = {
    viewport: { width: 1280, height: 800 },
    locale: "th-TH" as const,
    ...(storageState ? { storageState } : {}),
  };
  try {
    const browser = await chromium.launch({
      headless: false,
      channel: preferred as "chrome",
      args: ["--disable-blink-features=AutomationControlled"],
    });
    console.log(`ใช้เบราว์เซอร์: ${preferred}`);
    const context = await browser.newContext(contextOpts);
    return { browser, context };
  } catch (err) {
    console.warn(`เปิด ${preferred} ไม่ได้ — ใช้ Chromium แทน`);
    const browser = await chromium.launch({ headless: false });
    const context = await browser.newContext(contextOpts);
    return { browser, context };
  }
}

async function captureTokens(context: BrowserContext): Promise<{
  idToken: string;
  appCheckToken: string;
  refreshToken: string | null;
}> {
  const captured: Captured = { idToken: null, appCheckToken: null, refreshToken: null };

  context.on("request", (req) => absorbFromRequest(req, captured));
  context.on("response", (res) => {
    void absorbFromResponse(res, captured);
  });

  const page = await context.newPage();
  console.log(`เปิด ${START_URL}`);
  console.log("ถ้าค้างหน้า login: กรอกบัญชี Scrapee จริง แล้วกด Submit — สคริปต์จะไม่รีโหลดหน้า login");

  await page.goto(START_URL, { waitUntil: "domcontentloaded", timeout: 120_000 });

  if (isLoginUrl(page.url())) {
    await tryAutoLogin(page);
  }

  const started = Date.now();
  let lastLog = -1;
  let lastDashboardNudge = 0;
  let lastIndexedDbTry = 0;
  let autoLoginTried = isLoginUrl(page.url());

  while (Date.now() - started < TIMEOUT_MS) {
    if (captured.idToken && captured.appCheckToken) break;

    const elapsed = Date.now() - started;
    const url = page.url();

    if (isLoginUrl(url) && !autoLoginTried) {
      autoLoginTried = true;
      await tryAutoLogin(page);
    }

    if (!captured.idToken && elapsed - lastIndexedDbTry >= 8_000 && !isLoginUrl(url)) {
      lastIndexedDbTry = elapsed;
      const fromDb = await tryReadIdTokenFromIndexedDb(page);
      if (fromDb) absorbJwt(fromDb, captured);
    }

    // รีโหลดเฉพาะตอนอยู่บน dashboard แล้ว และยังขาด token
    if (!isLoginUrl(url) && elapsed - lastDashboardNudge >= 25_000) {
      lastDashboardNudge = elapsed;
      console.log("อยู่บนแอปแล้ว — รีเฟรชเบาๆ เพื่อกระตุ้น token...");
      await page.reload({ waitUntil: "domcontentloaded" }).catch(() => undefined);
    }

    await new Promise((r) => setTimeout(r, 1000));
    const secs = Math.floor(elapsed / 1000);
    if (secs >= 5 && secs - lastLog >= 10) {
      lastLog = secs;
      console.log(
        `รอ token... (${secs}s) idToken=${captured.idToken ? "OK" : "-"} appCheck=${captured.appCheckToken ? "OK" : "-"} url=${url}`
      );
      if (isLoginUrl(url)) {
        console.log("  → ยังอยู่หน้า login: กรอกอีเมล/รหัสบัญชีจริง แล้วกด Submit");
      }
    }
  }

  await page.close().catch(() => undefined);

  if (!captured.idToken || !captured.appCheckToken) {
    throw new Error(
      [
        `จับ token ไม่ครบ (idToken=${Boolean(captured.idToken)}, appCheck=${Boolean(captured.appCheckToken)})`,
        `วิธีแก้:`,
        `  1) ใส่ SCRAPEE_PASSWORD ใน .env ให้ตรงบัญชี Scrapee`,
        `  2) หรือกรอกเองใน Chrome ที่เปิดขึ้น — อย่าใช้ john@scrappy.com`,
        `  3) รอจนเข้า https://scrapee.app/dashboard สำเร็จ`,
      ].join("\n")
    );
  }

  return {
    idToken: captured.idToken,
    appCheckToken: captured.appCheckToken,
    refreshToken: captured.refreshToken,
  };
}

async function main(): Promise<void> {
  fs.mkdirSync(AUTH_DIR, { recursive: true });
  const { browser, context } = await launchContext();

  try {
    const tokens = await captureTokens(context);

    const envUpdate: Record<string, string> = {
      SCRAPEE_ID_TOKEN: tokens.idToken,
      FIREBASE_APP_CHECK_TOKEN: tokens.appCheckToken,
    };
    if (tokens.refreshToken) {
      envUpdate.SCRAPEE_REFRESH_TOKEN = tokens.refreshToken;
    }

    upsertEnvValues(envUpdate);
    await context.storageState({ path: STORAGE_PATH });

    console.log("บันทึก session → .auth/scrapee.json");
    console.log("อัปเดต .env แล้ว");
    console.log("ต่อไปรัน: npm run sync (หรือกดอัปเดทบนเว็บได้เลย ไม่ต้องรีสตาร์ท)");
  } finally {
    await context.close().catch(() => undefined);
    await browser.close().catch(() => undefined);
  }
}

function wipeAuthSession(): void {
  if (!fs.existsSync(STORAGE_PATH)) return;
  fs.unlinkSync(STORAGE_PATH);
  console.log("ลบ .auth/scrapee.json เพราะจับ token ไม่สำเร็จ");
}

main().catch((err) => {
  console.error("เกิดข้อผิดพลาด:", err);
  wipeAuthSession();
  process.exitCode = 1;
});
