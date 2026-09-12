import { cookies } from "next/headers";
import { errorJson, json } from "@/lib/api";
import { readSessionFromCookies, refreshSessionUser } from "@/lib/auth";
import { SESSION_COOKIE, sessionCookieOptions, signSession } from "@/lib/auth-session";

export async function GET(request: Request) {
  const session = await readSessionFromCookies();
  if (!session) return errorJson("กรุณาเข้าสู่ระบบ", 401);
  const fresh = await refreshSessionUser(session);
  if (!fresh) return errorJson("บัญชีถูกปิดสิทธิ์", 403);
  if (fresh.role !== session.role || fresh.status !== session.status || fresh.name !== session.name) {
    const store = await cookies();
    store.set(SESSION_COOKIE, await signSession(fresh), sessionCookieOptions(request));
  }
  return json(fresh);
}
