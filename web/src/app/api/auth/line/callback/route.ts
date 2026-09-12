import { cookies } from "next/headers";
import { exchangeLineProfile, lineChannelConfig } from "@/lib/auth";
import {
  OAUTH_STATE_COOKIE,
  SESSION_COOKIE,
  appBaseUrl,
  sessionCookieOptions,
  signSession,
} from "@/lib/auth-session";
import { writeDashboardLog } from "@/lib/dashboard-logs";
import { upsertDashboardUser } from "@/lib/dashboard-users";

function redirectTo(request: Request, path: string): Response {
  return Response.redirect(new URL(path, `${appBaseUrl(request)}/`));
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code") ?? "";
  const state = url.searchParams.get("state") ?? "";
  const store = await cookies();
  const expected = store.get(OAUTH_STATE_COOKIE)?.value ?? "";
  store.delete(OAUTH_STATE_COOKIE);
  if (!code || !state || !expected || state !== expected) {
    return redirectTo(request, "/login?error=state");
  }
  const config = lineChannelConfig();
  if (!config) {
    return redirectTo(request, "/login?error=config");
  }
  try {
    const profile = await exchangeLineProfile({
      channelId: config.channelId,
      channelSecret: config.channelSecret,
      redirectUri: `${appBaseUrl(request)}/api/auth/line/callback`,
      code,
    });
    const user = await upsertDashboardUser({
      lineUserId: profile.userId,
      name: profile.name,
      pictureUrl: profile.pictureUrl,
    });
    if (user.status === "disabled") {
      await writeDashboardLog({
        lineUserId: user.lineUserId,
        displayName: user.name,
        role: user.role,
        action: "login",
        label: "เข้าสู่ระบบแต่ถูกปิดสิทธิ์",
        detail: { status: "disabled" },
      });
      return redirectTo(request, "/login?error=disabled");
    }
    store.set(SESSION_COOKIE, await signSession(user), sessionCookieOptions(request));
    if (user.status === "pending") {
      await writeDashboardLog({
        lineUserId: user.lineUserId,
        displayName: user.name,
        role: user.role,
        action: "pending",
        label: "เข้าสู่ระบบ รออนุมัติ",
      });
      return redirectTo(request, "/pending");
    }
    await writeDashboardLog({
      lineUserId: user.lineUserId,
      displayName: user.name,
      role: user.role,
      action: "login",
      label: "เข้าสู่ระบบ",
    });
    return redirectTo(request, "/");
  } catch {
    return redirectTo(request, "/login?error=line");
  }
}
