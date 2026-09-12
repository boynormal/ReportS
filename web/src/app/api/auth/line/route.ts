import { cookies } from "next/headers";
import { errorJson } from "@/lib/api";
import { lineAuthorizeUrl, lineChannelConfig } from "@/lib/auth";
import { OAUTH_STATE_COOKIE, appBaseUrl, stateCookieOptions } from "@/lib/auth-session";

export async function GET(request: Request) {
  const config = lineChannelConfig();
  if (!config) {
    return errorJson("ยังไม่ได้ตั้งค่า LINE_CHANNEL_ID / LINE_CHANNEL_SECRET", 500);
  }
  const state = crypto.randomUUID();
  const redirectUri = `${appBaseUrl(request)}/api/auth/line/callback`;
  const store = await cookies();
  store.set(OAUTH_STATE_COOKIE, state, stateCookieOptions(request));
  return Response.redirect(lineAuthorizeUrl({ channelId: config.channelId, redirectUri, state }));
}
