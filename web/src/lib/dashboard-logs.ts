import { getPool } from "./db";
import type { DashboardLogAction, DashboardLogRow } from "./dashboard-log-types";

export type { DashboardLogAction, DashboardLogRow } from "./dashboard-log-types";

export async function writeDashboardLog(input: {
  lineUserId?: string | null;
  displayName?: string | null;
  role?: string | null;
  action: DashboardLogAction;
  path?: string | null;
  label?: string | null;
  detail?: unknown;
}): Promise<void> {
  try {
    const pool = getPool();
    await pool.query(
      `INSERT INTO dashboard_user_logs (line_user_id, display_name, role, action, path, label, detail)
       VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)`,
      [
        input.lineUserId ?? null,
        input.displayName ?? null,
        input.role ?? null,
        input.action,
        input.path ?? null,
        input.label ?? null,
        input.detail == null ? null : JSON.stringify(input.detail),
      ]
    );
  } catch (err) {
    console.error("dashboard log failed", err);
  }
}

export async function listDashboardLogs(filters?: {
  query?: string | null;
  action?: string | null;
  limit?: number;
}): Promise<DashboardLogRow[]> {
  const pool = getPool();
  const params: unknown[] = [];
  let where = "WHERE 1=1";
  if (filters?.action) {
    params.push(filters.action);
    where += ` AND action = $${params.length}`;
  }
  if (filters?.query) {
    params.push(`%${filters.query.trim()}%`);
    where += ` AND (COALESCE(display_name, '') ILIKE $${params.length} OR COALESCE(line_user_id, '') ILIKE $${params.length} OR COALESCE(label, '') ILIKE $${params.length})`;
  }
  const limit = Math.min(Math.max(filters?.limit ?? 200, 1), 200);
  params.push(limit);
  const result = await pool.query<{
    id: string;
    at: Date;
    line_user_id: string | null;
    display_name: string | null;
    role: string | null;
    action: string;
    path: string | null;
    label: string | null;
    detail: unknown;
  }>(
    `SELECT id::text, at, line_user_id, display_name, role, action, path, label, detail
     FROM dashboard_user_logs
     ${where}
     ORDER BY at DESC
     LIMIT $${params.length}`,
    params
  );
  return result.rows.map((row) => ({
    id: Number(row.id),
    at: row.at.toISOString(),
    lineUserId: row.line_user_id,
    displayName: row.display_name,
    role: row.role,
    action: row.action as DashboardLogAction,
    path: row.path,
    label: row.label,
    detail: row.detail,
  }));
}
