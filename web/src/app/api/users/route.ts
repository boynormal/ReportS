import { errorJson, json } from "@/lib/api";
import { requireRole } from "@/lib/auth";
import { isDashboardRole, isDashboardStatus } from "@/lib/auth-types";
import { writeDashboardLog } from "@/lib/dashboard-logs";
import { getDashboardUser, listDashboardUsers, updateDashboardUser } from "@/lib/dashboard-users";

export async function GET(request: Request) {
  const session = await requireRole(request, ["admin"]);
  if (session instanceof Response) return session;
  return json({ users: await listDashboardUsers() });
}

export async function PATCH(request: Request) {
  const session = await requireRole(request, ["admin"]);
  if (session instanceof Response) return session;
  const body = (await request.json()) as {
    lineUserId?: string;
    role?: string;
    status?: string;
  };
  const lineUserId = body.lineUserId?.trim() ?? "";
  if (!lineUserId) return errorJson("กรุณาใส่ผู้ใช้", 400);
  if (body.role != null && !isDashboardRole(body.role)) return errorJson("สิทธิ์ไม่ถูกต้อง", 400);
  if (body.status != null && !isDashboardStatus(body.status)) return errorJson("สถานะไม่ถูกต้อง", 400);
  try {
    const before = await getDashboardUser(lineUserId);
    const user = await updateDashboardUser(lineUserId, {
      role: body.role,
      status: body.status,
    });
    const action =
      before?.status === "pending" && user.status === "active"
        ? "approve"
        : before?.status !== "disabled" && user.status === "disabled"
          ? "disable"
          : before?.status === "disabled" && user.status === "active"
            ? "enable"
            : before?.role !== user.role
              ? "role_change"
              : "role_change";
    const labels = {
      approve: "อนุมัติผู้ใช้",
      disable: "ปิดสิทธิ์ผู้ใช้",
      enable: "เปิดสิทธิ์ผู้ใช้",
      role_change: "เปลี่ยนสิทธิ์ผู้ใช้",
    } as const;
    await writeDashboardLog({
      lineUserId: session.lineUserId,
      displayName: session.name,
      role: session.role,
      action,
      label: `${labels[action]} ${user.name || user.lineUserId}`,
      detail: {
        targetId: user.lineUserId,
        targetName: user.name,
        fromRole: before?.role ?? null,
        toRole: user.role,
        fromStatus: before?.status ?? null,
        toStatus: user.status,
      },
    });
    return json({ user });
  } catch (err) {
    return errorJson(err instanceof Error ? err.message : "อัปเดตไม่สำเร็จ", 400);
  }
}
