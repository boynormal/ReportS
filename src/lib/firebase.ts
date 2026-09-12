/**
 * Scrapee Firebase access via REST APIs.
 *
 * The Firebase web client SDK fails in Node with
 * auth/firebase-app-check-token-is-invalid when App Check is enforced.
 *
 * Login order:
 * 1) SCRAPEE_ID_TOKEN (short-lived)
 * 2) SCRAPEE_REFRESH_TOKEN → securetoken exchange (recommended under App Check)
 * 3) email/password via Identity Toolkit (works only if App Check allows it)
 */

import {
  decodeFields,
  documentIdFromName,
  toTimestampValue,
  type FirestoreRestValue,
} from "./firestore-rest.js";
import {
  transformCustomerGroup,
  transformEmployee,
  transformOutTicket,
  transformProduct,
  transformSeller,
  transformStockTransform,
  transformTicket,
  type CustomerGroupRow,
  type EmployeeRow,
  type OutTicketRow,
  type ProductRow,
  type SellerRow,
  type StockTransformRow,
  type TicketRow,
} from "./transform.js";

const PROJECT_ID = "scrappy-prod";
const API_KEY = "AIzaSyDbfhacQo3A2y5u4YuIlNk1JREwERifVhk";

export interface ScrapeeSession {
  companyId: string;
  uid: string;
  idToken: string;
  refreshToken?: string;
}

interface SignInResponse {
  idToken?: string;
  localId?: string;
  refreshToken?: string;
  error?: { message?: string; code?: number };
}

interface RefreshResponse {
  id_token?: string;
  refresh_token?: string;
  user_id?: string;
  error?: { message?: string };
}

interface RunQueryRow {
  document?: {
    name: string;
    fields?: Record<string, FirestoreRestValue>;
    createTime?: string;
    updateTime?: string;
  };
}

function appCheckHeaders(): Record<string, string> {
  const token = process.env.FIREBASE_APP_CHECK_TOKEN;
  if (!token) return {};
  return { "X-Firebase-AppCheck": token };
}

function decodeJwtPayload(idToken: string): Record<string, unknown> {
  const part = idToken.split(".")[1];
  if (!part) throw new Error("รูปแบบ idToken ไม่ถูกต้อง");
  const json = Buffer.from(part, "base64url").toString("utf8");
  return JSON.parse(json) as Record<string, unknown>;
}

function sessionFromIdToken(idToken: string, refreshToken?: string): ScrapeeSession {
  const claims = decodeJwtPayload(idToken);
  const companyId = claims.companyId;
  const uid = typeof claims.user_id === "string" ? claims.user_id : claims.sub;
  if (typeof companyId !== "string" || !companyId) {
    throw new Error("ไม่พบ companyId ใน token ของบัญชีนี้ — ไม่สามารถระบุ path ได้");
  }
  if (typeof uid !== "string" || !uid) {
    throw new Error("ไม่พบ uid ใน token");
  }
  return { companyId, uid, idToken, refreshToken };
}

async function loginWithRefreshToken(refreshToken: string): Promise<ScrapeeSession> {
  const url = `https://securetoken.googleapis.com/v1/token?key=${API_KEY}`;
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: refreshToken,
  });
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  const data = (await res.json()) as RefreshResponse;
  if (!res.ok || !data.id_token) {
    throw new Error(
      `แลก refresh token ไม่สำเร็จ: ${data.error?.message ?? res.statusText}. ` +
        `ลอง login ใหม่ในเว็บ Scrapee แล้วคัดลอก refreshToken มาใส่ SCRAPEE_REFRESH_TOKEN อีกครั้ง`
    );
  }
  return sessionFromIdToken(data.id_token, data.refresh_token ?? refreshToken);
}

async function loginWithPassword(email: string, password: string): Promise<ScrapeeSession> {
  const url = `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${API_KEY}`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...appCheckHeaders(),
    },
    body: JSON.stringify({
      email,
      password,
      returnSecureToken: true,
    }),
  });

  const body = (await res.json()) as SignInResponse;
  if (!res.ok || !body.idToken || !body.localId) {
    const msg = body.error?.message ?? res.statusText;
    if (String(msg).toLowerCase().includes("app check")) {
      throw new Error(
        [
          `Firebase App Check บล็อก email/password login (${msg}).`,
          `แก้โดยใส่ SCRAPEE_REFRESH_TOKEN ใน .env (ได้จากเว็บ Scrapee หลัง login):`,
          `  1) เปิดเว็บ Scrapee แล้ว login ด้วยบัญชีเดิม`,
          `  2) DevTools → Application → Local Storage`,
          `  3) หา key ที่ขึ้นต้นด้วย firebase:authUser:`,
          `  4) คัดลอกค่า stsTokenManager.refreshToken`,
          `  5) ใส่ใน .env เป็น SCRAPEE_REFRESH_TOKEN=...`,
        ].join("\n")
      );
    }
    throw new Error(`Firebase login ไม่สำเร็จ: ${msg}`);
  }

  return {
    companyId: sessionFromIdToken(body.idToken).companyId,
    uid: body.localId,
    idToken: body.idToken,
    refreshToken: body.refreshToken,
  };
}

function looksLikeJwt(value: string): boolean {
  return value.startsWith("eyJ") && value.split(".").length >= 3;
}

function isJwtExpired(idToken: string, skewSeconds = 60): boolean {
  try {
    const exp = decodeJwtPayload(idToken).exp;
    if (typeof exp !== "number") return false;
    return exp * 1000 <= Date.now() + skewSeconds * 1000;
  } catch {
    return true;
  }
}

export async function loginScrapee(email: string, password: string): Promise<ScrapeeSession> {
  const idTokenEnv = process.env.SCRAPEE_ID_TOKEN?.trim();
  if (idTokenEnv && !isJwtExpired(idTokenEnv)) {
    console.log("ใช้ SCRAPEE_ID_TOKEN จาก .env");
    return sessionFromIdToken(idTokenEnv);
  }
  if (idTokenEnv && isJwtExpired(idTokenEnv)) {
    console.log("SCRAPEE_ID_TOKEN หมดอายุ — ลอง refresh / login ต่อ");
  }

  const refreshToken = process.env.SCRAPEE_REFRESH_TOKEN?.trim();
  // Common mistake: paste idToken into SCRAPEE_REFRESH_TOKEN
  if (refreshToken && looksLikeJwt(refreshToken)) {
    console.log("ตรวจพบ JWT ใน SCRAPEE_REFRESH_TOKEN — ใช้เป็น idToken");
    return sessionFromIdToken(refreshToken);
  }
  if (refreshToken) {
    console.log("ใช้ SCRAPEE_REFRESH_TOKEN แลก idToken...");
    return loginWithRefreshToken(refreshToken);
  }

  console.log("login ด้วย email/password...");
  return loginWithPassword(email, password);
}

async function runQuery(
  session: ScrapeeSession,
  parentPath: string,
  structuredQuery: Record<string, unknown>
): Promise<RunQueryRow[]> {
  const url = `https://firestore.googleapis.com/v1/${parentPath}:runQuery`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${session.idToken}`,
      ...appCheckHeaders(),
    },
    body: JSON.stringify({ structuredQuery }),
  });

  const body = (await res.json()) as
    | RunQueryRow[]
    | { error?: { message?: string; status?: string } };
  if (!res.ok) {
    const msg =
      !Array.isArray(body) && body.error?.message ? body.error.message : res.statusText;
    const status = !Array.isArray(body) ? body.error?.status : undefined;
    const lower = String(msg).toLowerCase();
    if (lower.includes("app check")) {
      throw new Error(
        `Firestore ถูก App Check บล็อก (${msg}). ใส่ FIREBASE_APP_CHECK_TOKEN ใน .env (จาก header X-Firebase-AppCheck ในเบราว์เซอร์)`
      );
    }
    if (res.status === 401 || res.status === 403 || status === "PERMISSION_DENIED") {
      throw new Error(
        [
          `Firestore ปฏิเสธการอ่าน (${status ?? res.status}: ${msg}).`,
          `idToken ยัง login ได้ แต่ query โดนบล็อก — มักเพราะ App Check`,
          `แก้: ใน DevTools → Network เปิด request ไป firestore.googleapis.com`,
          `คัดลอก Request Header ชื่อ X-Firebase-AppCheck แล้วใส่ใน .env เป็น FIREBASE_APP_CHECK_TOKEN=...`,
          `จากนั้นรัน npm run sync ใหม่ (ต้องใช้คู่กับ SCRAPEE_ID_TOKEN ที่ยังไม่หมดอายุ)`,
        ].join("\n")
      );
    }
    throw new Error(`Firestore query ไม่สำเร็จ: ${msg}`);
  }
  return Array.isArray(body) ? body : [];
}

function companyParent(companyId: string): string {
  return `projects/${PROJECT_ID}/databases/(default)/documents/companies/${companyId}`;
}

function rangeFilter(fieldPath: string, start: Date, end: Date): Record<string, unknown> {
  return {
    compositeFilter: {
      op: "AND",
      filters: [
        {
          fieldFilter: {
            field: { fieldPath },
            op: "GREATER_THAN_OR_EQUAL",
            value: toTimestampValue(start),
          },
        },
        {
          fieldFilter: {
            field: { fieldPath },
            op: "LESS_THAN",
            value: toTimestampValue(end),
          },
        },
      ],
    },
  };
}

function rowToTicket(companyId: string, row: RunQueryRow): TicketRow | null {
  if (!row.document?.fields) return null;
  const id = documentIdFromName(row.document.name);
  const data = decodeFields(row.document.fields);
  const updateTime = row.document.updateTime ? new Date(row.document.updateTime) : null;
  return transformTicket(id, companyId, data, updateTime);
}

export async function fetchTicketsByPaidRange(
  session: ScrapeeSession,
  start: Date,
  end: Date
): Promise<TicketRow[]> {
  const rows = await runQuery(session, companyParent(session.companyId), {
    from: [{ collectionId: "inTickets" }],
    where: rangeFilter("paidTimestamp", start, end),
  });
  return rows
    .map((row) => rowToTicket(session.companyId, row))
    .filter((t): t is TicketRow => t !== null);
}

export async function fetchTicketsUpdatedSince(
  session: ScrapeeSession,
  since: Date
): Promise<TicketRow[]> {
  const rows = await runQuery(session, companyParent(session.companyId), {
    from: [{ collectionId: "inTickets" }],
    where: {
      fieldFilter: {
        field: { fieldPath: "updatedAt" },
        op: "GREATER_THAN_OR_EQUAL",
        value: toTimestampValue(since),
      },
    },
  });
  return rows
    .map((row) => rowToTicket(session.companyId, row))
    .filter((t): t is TicketRow => t !== null);
}

export async function fetchTicketsByCreatedRange(
  session: ScrapeeSession,
  start: Date,
  end: Date
): Promise<TicketRow[]> {
  const rows = await runQuery(session, companyParent(session.companyId), {
    from: [{ collectionId: "inTickets" }],
    where: rangeFilter("createdAt", start, end),
  });
  return rows
    .map((row) => rowToTicket(session.companyId, row))
    .filter((t): t is TicketRow => t !== null);
}

export async function fetchOutTicketsByCreatedRange(
  session: ScrapeeSession,
  start: Date,
  end: Date
): Promise<OutTicketRow[] | null> {
  const rows = await runQueryOrSkip(session, "outTickets", {
    from: [{ collectionId: "outTickets" }],
    where: rangeFilter("createdAt", start, end),
  });
  if (!rows) return null;
  return rowsToDocuments(rows).map((d) =>
    transformOutTicket(d.id, session.companyId, d.data, d.updateTime)
  );
}

export async function fetchAllEmployees(
  session: ScrapeeSession
): Promise<EmployeeRow[] | null> {
  const rows = await runQueryOrSkip(session, "employees", {
    from: [{ collectionId: "employees" }],
  });
  if (!rows) return null;
  return rowsToDocuments(rows).map((d) => transformEmployee(d.id, session.companyId, d.data));
}

export async function fetchAllSellers(session: ScrapeeSession): Promise<SellerRow[]> {
  const rows = await runQuery(session, companyParent(session.companyId), {
    from: [{ collectionId: "sellers" }],
  });
  const sellers: SellerRow[] = [];
  for (const row of rows) {
    if (!row.document?.fields) continue;
    const id = documentIdFromName(row.document.name);
    sellers.push(transformSeller(id, session.companyId, decodeFields(row.document.fields)));
  }
  return sellers;
}

export async function countTicketsByPaidRange(
  session: ScrapeeSession,
  start: Date,
  end: Date
): Promise<number> {
  const tickets = await fetchTicketsByPaidRange(session, start, end);
  return tickets.length;
}

function isPermissionError(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err);
  return /PERMISSION_DENIED|ปฏิเสธการอ่าน|insufficient permissions/i.test(message);
}

async function runQueryOrSkip(
  session: ScrapeeSession,
  collectionId: string,
  structuredQuery: Record<string, unknown>
): Promise<RunQueryRow[] | null> {
  try {
    return await runQuery(session, companyParent(session.companyId), structuredQuery);
  } catch (err) {
    if (isPermissionError(err)) {
      console.warn(`ข้าม ${collectionId}: บัญชีนี้ไม่มีสิทธิ์อ่าน (${err instanceof Error ? err.message : err})`);
      return null;
    }
    throw err;
  }
}

function rowsToDocuments(rows: RunQueryRow[]): Array<{
  id: string;
  data: Record<string, unknown>;
  updateTime: Date | null;
}> {
  const out: Array<{ id: string; data: Record<string, unknown>; updateTime: Date | null }> = [];
  for (const row of rows) {
    if (!row.document?.fields) continue;
    out.push({
      id: documentIdFromName(row.document.name),
      data: decodeFields(row.document.fields),
      updateTime: row.document.updateTime ? new Date(row.document.updateTime) : null,
    });
  }
  return out;
}

export async function fetchAllProducts(session: ScrapeeSession): Promise<ProductRow[] | null> {
  const rows = await runQueryOrSkip(session, "products", {
    from: [{ collectionId: "products" }],
  });
  if (!rows) return null;
  return rowsToDocuments(rows).map((d) => transformProduct(d.id, session.companyId, d.data));
}

export async function fetchAllCustomerGroups(
  session: ScrapeeSession
): Promise<CustomerGroupRow[] | null> {
  const rows = await runQueryOrSkip(session, "customerGroups", {
    from: [{ collectionId: "customerGroups" }],
  });
  if (!rows) return null;
  return rowsToDocuments(rows).map((d) => transformCustomerGroup(d.id, session.companyId, d.data));
}

export async function fetchOutTicketsByPaidRange(
  session: ScrapeeSession,
  start: Date,
  end: Date
): Promise<OutTicketRow[] | null> {
  const rows = await runQueryOrSkip(session, "outTickets", {
    from: [{ collectionId: "outTickets" }],
    where: rangeFilter("paidAt", start, end),
  });
  if (!rows) return null;
  return rowsToDocuments(rows).map((d) =>
    transformOutTicket(d.id, session.companyId, d.data, d.updateTime)
  );
}

export async function fetchOutTicketsUpdatedSince(
  session: ScrapeeSession,
  since: Date
): Promise<OutTicketRow[] | null> {
  const rows = await runQueryOrSkip(session, "outTickets", {
    from: [{ collectionId: "outTickets" }],
    where: {
      fieldFilter: {
        field: { fieldPath: "updatedAt" },
        op: "GREATER_THAN_OR_EQUAL",
        value: toTimestampValue(since),
      },
    },
  });
  if (!rows) return null;
  return rowsToDocuments(rows).map((d) =>
    transformOutTicket(d.id, session.companyId, d.data, d.updateTime)
  );
}

export async function fetchTransformsByCreatedRange(
  session: ScrapeeSession,
  start: Date,
  end: Date
): Promise<StockTransformRow[] | null> {
  const rows = await runQueryOrSkip(session, "transforms", {
    from: [{ collectionId: "transforms" }],
    where: rangeFilter("createdAt", start, end),
  });
  if (!rows) return null;
  return rowsToDocuments(rows).map((d) =>
    transformStockTransform(d.id, session.companyId, d.data, d.updateTime)
  );
}

export async function fetchTransformsCreatedSince(
  session: ScrapeeSession,
  since: Date
): Promise<StockTransformRow[] | null> {
  const rows = await runQueryOrSkip(session, "transforms", {
    from: [{ collectionId: "transforms" }],
    where: {
      fieldFilter: {
        field: { fieldPath: "createdAt" },
        op: "GREATER_THAN_OR_EQUAL",
        value: toTimestampValue(since),
      },
    },
  });
  if (!rows) return null;
  return rowsToDocuments(rows).map((d) =>
    transformStockTransform(d.id, session.companyId, d.data, d.updateTime)
  );
}

export async function countOutTicketsByPaidRange(
  session: ScrapeeSession,
  start: Date,
  end: Date
): Promise<number | null> {
  const tickets = await fetchOutTicketsByPaidRange(session, start, end);
  return tickets ? tickets.length : null;
}
