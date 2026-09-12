import { getPool } from "./db";
import type { DashboardRole, DashboardStatus, DashboardUser, SessionUser } from "./auth-types";
import { isDashboardRole, isDashboardStatus } from "./auth-types";

function bootstrapAdminIds(): Set<string> {
  return new Set(
    (process.env.DASHBOARD_ADMIN_LINE_IDS ?? "")
      .split(",")
      .map((id) => id.trim())
      .filter(Boolean)
  );
}

function mapUser(row: {
  line_user_id: string;
  display_name: string | null;
  picture_url: string | null;
  role: string;
  status: string;
  created_at?: Date | null;
  last_login_at?: Date | null;
}): DashboardUser | null {
  if (!isDashboardRole(row.role) || !isDashboardStatus(row.status)) return null;
  return {
    lineUserId: row.line_user_id,
    name: row.display_name ?? "",
    pictureUrl: row.picture_url,
    role: row.role,
    status: row.status,
    createdAt: row.created_at ? row.created_at.toISOString() : null,
    lastLoginAt: row.last_login_at ? row.last_login_at.toISOString() : null,
  };
}

export async function upsertDashboardUser(input: {
  lineUserId: string;
  name: string;
  pictureUrl: string | null;
}): Promise<SessionUser> {
  const pool = getPool();
  const bootstrap = bootstrapAdminIds().has(input.lineUserId);
  const result = await pool.query<{
    line_user_id: string;
    display_name: string | null;
    picture_url: string | null;
    role: string;
    status: string;
  }>(
    `INSERT INTO dashboard_users (line_user_id, display_name, picture_url, role, status, last_login_at)
     VALUES ($1, $2, $3, $4, $5, now())
     ON CONFLICT (line_user_id) DO UPDATE SET
       display_name = EXCLUDED.display_name,
       picture_url = EXCLUDED.picture_url,
       last_login_at = now(),
       role = CASE WHEN $6 THEN 'admin' ELSE dashboard_users.role END,
       status = CASE WHEN $6 THEN 'active' ELSE dashboard_users.status END
     RETURNING line_user_id, display_name, picture_url, role, status`,
    [input.lineUserId, input.name || null, input.pictureUrl, bootstrap ? "admin" : "viewer", bootstrap ? "active" : "pending", bootstrap]
  );
  const user = mapUser(result.rows[0]);
  if (!user) throw new Error("บันทึกผู้ใช้ไม่สำเร็จ");
  return { lineUserId: user.lineUserId, name: user.name, role: user.role, status: user.status };
}

export async function getDashboardUser(lineUserId: string): Promise<DashboardUser | null> {
  const pool = getPool();
  const result = await pool.query<{
    line_user_id: string;
    display_name: string | null;
    picture_url: string | null;
    role: string;
    status: string;
    created_at: Date | null;
    last_login_at: Date | null;
  }>(
    `SELECT line_user_id, display_name, picture_url, role, status, created_at, last_login_at
     FROM dashboard_users WHERE line_user_id = $1`,
    [lineUserId]
  );
  const row = result.rows[0];
  return row ? mapUser(row) : null;
}

export async function listDashboardUsers(): Promise<DashboardUser[]> {
  const pool = getPool();
  const result = await pool.query<{
    line_user_id: string;
    display_name: string | null;
    picture_url: string | null;
    role: string;
    status: string;
    created_at: Date | null;
    last_login_at: Date | null;
  }>(
    `SELECT line_user_id, display_name, picture_url, role, status, created_at, last_login_at
     FROM dashboard_users
     ORDER BY
       CASE status WHEN 'pending' THEN 0 WHEN 'active' THEN 1 ELSE 2 END,
       last_login_at DESC NULLS LAST,
       created_at DESC`
  );
  return result.rows.map((row) => mapUser(row)).filter((row): row is DashboardUser => row != null);
}

export async function countActiveAdmins(exceptLineUserId?: string): Promise<number> {
  const pool = getPool();
  const result = exceptLineUserId
    ? await pool.query<{ n: string }>(
        `SELECT COUNT(*)::text AS n FROM dashboard_users
         WHERE status = 'active' AND role = 'admin' AND line_user_id <> $1`,
        [exceptLineUserId]
      )
    : await pool.query<{ n: string }>(
        `SELECT COUNT(*)::text AS n FROM dashboard_users
         WHERE status = 'active' AND role = 'admin'`
      );
  return Number(result.rows[0]?.n ?? 0);
}

export async function updateDashboardUser(
  lineUserId: string,
  patch: { role?: DashboardRole; status?: DashboardStatus }
): Promise<DashboardUser> {
  const current = await getDashboardUser(lineUserId);
  if (!current) throw new Error("ไม่พบผู้ใช้");
  const nextRole = patch.role ?? current.role;
  const nextStatus = patch.status ?? current.status;
  const remainsAdmin = nextStatus === "active" && nextRole === "admin";
  if (current.status === "active" && current.role === "admin" && !remainsAdmin) {
    const others = await countActiveAdmins(lineUserId);
    if (others < 1) throw new Error("ต้องเหลือแอดมินอย่างน้อยหนึ่งคน");
  }
  const pool = getPool();
  const result = await pool.query<{
    line_user_id: string;
    display_name: string | null;
    picture_url: string | null;
    role: string;
    status: string;
    created_at: Date | null;
    last_login_at: Date | null;
  }>(
    `UPDATE dashboard_users SET role = $2, status = $3
     WHERE line_user_id = $1
     RETURNING line_user_id, display_name, picture_url, role, status, created_at, last_login_at`,
    [lineUserId, nextRole, nextStatus]
  );
  const user = mapUser(result.rows[0]);
  if (!user) throw new Error("อัปเดตผู้ใช้ไม่สำเร็จ");
  return user;
}
