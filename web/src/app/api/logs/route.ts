import { errorJson, json } from "@/lib/api";
import { readSessionFromRequest, requireRole } from "@/lib/auth";
import { listDashboardLogs, writeDashboardLog } from "@/lib/dashboard-logs";

export async function GET(request: Request) {
  const session = await requireRole(request, ["admin"]);
  if (session instanceof Response) return session;
  const url = new URL(request.url);
  const action = url.searchParams.get("action")?.trim() || null;
  const query = url.searchParams.get("q")?.trim() || null;
  return json({
    logs: await listDashboardLogs({
      action: action && action !== "all" ? action : null,
      query,
    }),
  });
}

export async function POST(request: Request) {
  const session = await readSessionFromRequest(request);
  if (!session) return errorJson("กรุณาเข้าสู่ระบบ", 401);
  if (session.status !== "active") return errorJson("บัญชียังไม่ได้รับอนุมัติ", 403);
  const body = (await request.json()) as { action?: string; path?: string; label?: string };
  if (body.action !== "page") return errorJson("รับเฉพาะการเปิดหน้า", 400);
  const path = body.path?.trim() ?? "";
  const label = body.label?.trim() ?? "";
  if (!path || !label) return errorJson("กรุณาใส่หน้า", 400);
  if (path.startsWith("/api") || path.startsWith("/login") || path.startsWith("/pending")) {
    return json({ ok: true });
  }
  await writeDashboardLog({
    lineUserId: session.lineUserId,
    displayName: session.name,
    role: session.role,
    action: "page",
    path: path.slice(0, 300),
    label: label.slice(0, 120),
  });
  return json({ ok: true });
}
