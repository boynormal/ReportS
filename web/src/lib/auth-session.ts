import { SignJWT, jwtVerify } from "jose";
import type { DashboardRole, DashboardStatus, SessionUser } from "./auth-types";
import { isDashboardRole, isDashboardStatus } from "./auth-types";

export const SESSION_COOKIE = "scrapee_session";
export const OAUTH_STATE_COOKIE = "scrapee_oauth_state";
export const SESSION_MAX_AGE_SEC = 14 * 24 * 60 * 60;
export const OAUTH_STATE_MAX_AGE_SEC = 10 * 60;

function secretKey(): Uint8Array {
  const secret = process.env.AUTH_SECRET?.trim();
  if (!secret) {
    throw new Error("กรุณาตั้งค่า AUTH_SECRET ใน .env");
  }
  return new TextEncoder().encode(secret);
}

export function appBaseUrl(request: Request): string {
  const configured = process.env.APP_BASE_URL?.trim().replace(/\/$/, "");
  if (configured) return configured;
  const url = new URL(request.url);
  return `${url.protocol}//${url.host}`;
}

export function cookieSecure(request: Request): boolean {
  const base = process.env.APP_BASE_URL?.trim() ?? "";
  if (base.startsWith("https://")) return true;
  return new URL(request.url).protocol === "https:";
}

export function sessionCookieOptions(request: Request) {
  return {
    httpOnly: true,
    secure: cookieSecure(request),
    sameSite: "lax" as const,
    path: "/",
    maxAge: SESSION_MAX_AGE_SEC,
  };
}

export function stateCookieOptions(request: Request) {
  return {
    httpOnly: true,
    secure: cookieSecure(request),
    sameSite: "lax" as const,
    path: "/",
    maxAge: OAUTH_STATE_MAX_AGE_SEC,
  };
}

export async function signSession(user: SessionUser): Promise<string> {
  return new SignJWT({
    name: user.name,
    role: user.role,
    status: user.status,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(user.lineUserId)
    .setIssuedAt()
    .setExpirationTime(`${SESSION_MAX_AGE_SEC}s`)
    .sign(secretKey());
}

export async function verifySession(token: string | undefined | null): Promise<SessionUser | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secretKey());
    const lineUserId = typeof payload.sub === "string" ? payload.sub : "";
    const name = typeof payload.name === "string" ? payload.name : "";
    const role = typeof payload.role === "string" && isDashboardRole(payload.role) ? payload.role : null;
    const status = typeof payload.status === "string" && isDashboardStatus(payload.status) ? payload.status : null;
    if (!lineUserId || !role || !status) return null;
    return { lineUserId, name, role, status };
  } catch {
    return null;
  }
}

export function sessionFromCookieHeader(cookieHeader: string | null): Promise<SessionUser | null> {
  const token = readCookie(cookieHeader, SESSION_COOKIE);
  return verifySession(token);
}

export function readCookie(cookieHeader: string | null, name: string): string | null {
  if (!cookieHeader) return null;
  for (const part of cookieHeader.split(";")) {
    const trimmed = part.trim();
    if (!trimmed.startsWith(`${name}=`)) continue;
    return decodeURIComponent(trimmed.slice(name.length + 1));
  }
  return null;
}
