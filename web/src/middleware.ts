import { NextResponse, type NextRequest } from "next/server";
import { canSync, isAdmin } from "./lib/auth-types";
import { sessionFromCookieHeader } from "./lib/auth-session";

function isPublicPath(pathname: string): boolean {
  return (
    pathname === "/login" ||
    pathname === "/pending" ||
    pathname === "/api/auth/line" ||
    pathname === "/api/auth/line/callback" ||
    pathname === "/api/auth/logout" ||
    pathname === "/api/auth/me"
  );
}

function wantsJson(request: NextRequest, pathname: string): boolean {
  return pathname.startsWith("/api/") || (request.headers.get("accept") ?? "").includes("application/json");
}

function deny(request: NextRequest, pathname: string, status: number, message: string, loginPath = "/login") {
  if (wantsJson(request, pathname)) {
    return NextResponse.json({ error: message }, { status });
  }
  const url = request.nextUrl.clone();
  url.pathname = loginPath;
  url.search = "";
  return NextResponse.redirect(url);
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const session = await sessionFromCookieHeader(request.headers.get("cookie"));

  if (isPublicPath(pathname)) {
    if (session?.status === "active" && (pathname === "/login" || pathname === "/pending")) {
      const url = request.nextUrl.clone();
      url.pathname = "/";
      url.search = "";
      return NextResponse.redirect(url);
    }
    if (session?.status === "pending" && pathname === "/login") {
      const url = request.nextUrl.clone();
      url.pathname = "/pending";
      url.search = "";
      return NextResponse.redirect(url);
    }
    return NextResponse.next();
  }

  if (!session) {
    return deny(request, pathname, 401, "กรุณาเข้าสู่ระบบ");
  }
  if (session.status === "disabled") {
    return deny(request, pathname, 403, "บัญชีถูกปิดสิทธิ์");
  }
  if (session.status === "pending") {
    return deny(request, pathname, 403, "บัญชียังไม่ได้รับอนุมัติ", "/pending");
  }

  if (request.method === "POST" && pathname === "/api/sync" && !canSync(session.role)) {
    return deny(request, pathname, 403, "ไม่มีสิทธิ์ซิงก์");
  }
  if ((pathname === "/users" || pathname.startsWith("/api/users")) && !isAdmin(session.role)) {
    return deny(request, pathname, 403, "ไม่มีสิทธิ์จัดการผู้ใช้");
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
