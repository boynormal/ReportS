import { cookies } from "next/headers";
import { json } from "@/lib/api";
import { readSessionFromCookies } from "@/lib/auth";
import { SESSION_COOKIE, appBaseUrl } from "@/lib/auth-session";
import { writeDashboardLog } from "@/lib/dashboard-logs";

async function clearSession() {
  const session = await readSessionFromCookies();
  if (session) {
    await writeDashboardLog({
      lineUserId: session.lineUserId,
      displayName: session.name,
      role: session.role,
      action: "logout",
      label: "ออกจากระบบ",
    });
  }
  const store = await cookies();
  store.delete(SESSION_COOKIE);
}

export async function POST(request: Request) {
  await clearSession();
  const accept = request.headers.get("accept") ?? "";
  if (accept.includes("text/html")) {
    return Response.redirect(new URL("/login", `${appBaseUrl(request)}/`));
  }
  return json({ ok: true });
}

export async function GET(request: Request) {
  await clearSession();
  return Response.redirect(new URL("/login", `${appBaseUrl(request)}/`));
}
