import { cookies } from "next/headers";
import { errorJson } from "./api";
import type { DashboardRole, SessionUser } from "./auth-types";
import { SESSION_COOKIE, sessionFromCookieHeader, verifySession } from "./auth-session";
import { getDashboardUser } from "./dashboard-users";

export function lineChannelConfig(): { channelId: string; channelSecret: string } | null {
  const channelId = process.env.LINE_CHANNEL_ID?.trim() ?? "";
  const channelSecret = process.env.LINE_CHANNEL_SECRET?.trim() ?? "";
  if (!channelId || !channelSecret) return null;
  return { channelId, channelSecret };
}

export async function readSessionFromCookies(): Promise<SessionUser | null> {
  const store = await cookies();
  return verifySession(store.get(SESSION_COOKIE)?.value);
}

export async function readSessionFromRequest(request: Request): Promise<SessionUser | null> {
  return sessionFromCookieHeader(request.headers.get("cookie"));
}

export async function requireActiveSession(request: Request): Promise<SessionUser | Response> {
  const session = await readSessionFromRequest(request);
  if (!session) return errorJson("กรุณาเข้าสู่ระบบ", 401);
  if (session.status !== "active") return errorJson("บัญชียังไม่ได้รับอนุมัติ", 403);
  return session;
}

export async function requireRole(request: Request, roles: DashboardRole[]): Promise<SessionUser | Response> {
  const session = await requireActiveSession(request);
  if (session instanceof Response) return session;
  if (!roles.includes(session.role)) return errorJson("ไม่มีสิทธิ์", 403);
  return session;
}

export async function refreshSessionUser(session: SessionUser): Promise<SessionUser | null> {
  const fresh = await getDashboardUser(session.lineUserId);
  if (!fresh || fresh.status === "disabled") return null;
  return {
    lineUserId: fresh.lineUserId,
    name: fresh.name,
    role: fresh.role,
    status: fresh.status,
  };
}

export function lineAuthorizeUrl(input: { channelId: string; redirectUri: string; state: string }): string {
  const url = new URL("https://access.line.me/oauth2/v2.1/authorize");
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", input.channelId);
  url.searchParams.set("redirect_uri", input.redirectUri);
  url.searchParams.set("state", input.state);
  url.searchParams.set("scope", "profile openid");
  return url.toString();
}

export async function exchangeLineProfile(input: {
  channelId: string;
  channelSecret: string;
  redirectUri: string;
  code: string;
}): Promise<{ userId: string; name: string; pictureUrl: string | null }> {
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code: input.code,
    redirect_uri: input.redirectUri,
    client_id: input.channelId,
    client_secret: input.channelSecret,
  });
  const tokenRes = await fetch("https://api.line.me/oauth2/v2.1/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  const tokenJson = (await tokenRes.json()) as { access_token?: string; error_description?: string };
  if (!tokenRes.ok || !tokenJson.access_token) {
    throw new Error(tokenJson.error_description || "แลก token จาก LINE ไม่สำเร็จ");
  }
  const profileRes = await fetch("https://api.line.me/v2/profile", {
    headers: { Authorization: `Bearer ${tokenJson.access_token}` },
  });
  const profile = (await profileRes.json()) as {
    userId?: string;
    displayName?: string;
    pictureUrl?: string;
    message?: string;
  };
  if (!profileRes.ok || !profile.userId) {
    throw new Error(profile.message || "อ่านโปรไฟล์ LINE ไม่สำเร็จ");
  }
  return {
    userId: profile.userId,
    name: profile.displayName ?? "",
    pictureUrl: profile.pictureUrl ?? null,
  };
}
