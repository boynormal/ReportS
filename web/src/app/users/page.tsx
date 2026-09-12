"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import type { DashboardRole, DashboardStatus, DashboardUser } from "@/lib/auth-types";
import type { DashboardLogAction, DashboardLogRow } from "@/lib/dashboard-log-types";
import { formatWhen } from "@/lib/format";

const ROLE_LABEL: Record<DashboardRole, string> = {
  viewer: "ดูรายงาน",
  sync: "ซิงก์ได้",
  admin: "แอดมิน",
};

const STATUS_LABEL: Record<DashboardStatus, string> = {
  pending: "รออนุมัติ",
  active: "ใช้งาน",
  disabled: "ปิดสิทธิ์",
};

const ACTION_LABEL: Record<DashboardLogAction, string> = {
  login: "เข้าสู่ระบบ",
  pending: "รออนุมัติ",
  logout: "ออกจากระบบ",
  approve: "อนุมัติ",
  role_change: "เปลี่ยนสิทธิ์",
  disable: "ปิดสิทธิ์",
  enable: "เปิดสิทธิ์",
  sync: "ซิงก์",
  page: "เปิดหน้า",
};

export default function UsersPage() {
  const [users, setUsers] = useState<DashboardUser[]>([]);
  const [logs, setLogs] = useState<DashboardLogRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [logQuery, setLogQuery] = useState("");
  const [logAction, setLogAction] = useState("all");

  const load = useCallback(async () => {
    const res = await fetch("/api/users");
    const data = (await res.json()) as { users?: DashboardUser[]; error?: string };
    if (!res.ok) throw new Error(data.error || "โหลดรายชื่อไม่สำเร็จ");
    setUsers(data.users ?? []);
  }, []);

  const loadLogs = useCallback(async () => {
    const qs = new URLSearchParams();
    if (logQuery.trim()) qs.set("q", logQuery.trim());
    if (logAction !== "all") qs.set("action", logAction);
    const res = await fetch(`/api/logs?${qs}`);
    const data = (await res.json()) as { logs?: DashboardLogRow[]; error?: string };
    if (!res.ok) throw new Error(data.error || "โหลดประวัติไม่สำเร็จ");
    setLogs(data.logs ?? []);
  }, [logQuery, logAction]);

  useEffect(() => {
    load().catch((e) => setError(e instanceof Error ? e.message : String(e)));
  }, [load]);

  useEffect(() => {
    loadLogs().catch((e) => setError(e instanceof Error ? e.message : String(e)));
  }, [loadLogs]);

  async function patch(lineUserId: string, body: { role?: DashboardRole; status?: DashboardStatus }) {
    setBusyId(lineUserId);
    setError(null);
    try {
      const res = await fetch("/api/users", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lineUserId, ...body }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error || "อัปเดตไม่สำเร็จ");
      await load();
      await loadLogs();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="app">
      <p>
        <Link href="/">กลับแดชบอร์ด</Link>
      </p>
      <h1>ผู้ใช้แดชบอร์ด</h1>
      <p className="muted">อนุมัติคนที่เข้าด้วย LINE ครั้งแรก และตั้งสิทธิ์ดูรายงาน / ซิงก์ / แอดมิน</p>
      {error ? <p className="error">{error}</p> : null}
      <table>
        <thead>
          <tr>
            <th>ชื่อ</th>
            <th>สถานะ</th>
            <th>สิทธิ์</th>
            <th>เข้าล่าสุด</th>
            <th>จัดการ</th>
          </tr>
        </thead>
        <tbody>
          {users.length === 0 ? (
            <tr>
              <td colSpan={5} className="muted">
                ยังไม่มีผู้ใช้
              </td>
            </tr>
          ) : (
            users.map((user) => (
              <tr key={user.lineUserId}>
                <td>{user.name || user.lineUserId.slice(0, 8)}</td>
                <td>{STATUS_LABEL[user.status]}</td>
                <td>{ROLE_LABEL[user.role]}</td>
                <td>{user.lastLoginAt ? formatWhen(user.lastLoginAt) : "—"}</td>
                <td>
                  <div className="row">
                    {user.status !== "active" ? (
                      <button
                        className="pill"
                        type="button"
                        disabled={busyId === user.lineUserId}
                        onClick={() => void patch(user.lineUserId, { status: "active", role: user.role === "admin" ? "admin" : "viewer" })}
                      >
                        อนุมัติดูรายงาน
                      </button>
                    ) : null}
                    {user.status === "active" ? (
                      <select
                        value={user.role}
                        disabled={busyId === user.lineUserId}
                        onChange={(e) => void patch(user.lineUserId, { role: e.target.value as DashboardRole })}
                      >
                        <option value="viewer">ดูรายงาน</option>
                        <option value="sync">ซิงก์ได้</option>
                        <option value="admin">แอดมิน</option>
                      </select>
                    ) : null}
                    {user.status !== "disabled" ? (
                      <button
                        className="pill"
                        type="button"
                        disabled={busyId === user.lineUserId}
                        onClick={() => void patch(user.lineUserId, { status: "disabled" })}
                      >
                        ปิดสิทธิ์
                      </button>
                    ) : (
                      <button
                        className="pill"
                        type="button"
                        disabled={busyId === user.lineUserId}
                        onClick={() => void patch(user.lineUserId, { status: "active" })}
                      >
                        เปิดอีกครั้ง
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>

      <h2 style={{ marginTop: 28 }}>ประวัติ</h2>
      <p className="muted">200 รายการล่าสุด · เข้าออกระบบ อนุมัติ สิทธิ์ ซิงก์ และเปิดหน้า ไม่รวมทุก API</p>
      <div className="row" style={{ margin: "10px 0 12px" }}>
        <input
          value={logQuery}
          onChange={(e) => setLogQuery(e.target.value)}
          placeholder="ค้นชื่อหรือหน้า"
        />
        <select value={logAction} onChange={(e) => setLogAction(e.target.value)}>
          <option value="all">ทุกเหตุการณ์</option>
          <option value="login">เข้าสู่ระบบ</option>
          <option value="pending">รออนุมัติ</option>
          <option value="logout">ออกจากระบบ</option>
          <option value="approve">อนุมัติ</option>
          <option value="role_change">เปลี่ยนสิทธิ์</option>
          <option value="disable">ปิดสิทธิ์</option>
          <option value="enable">เปิดสิทธิ์</option>
          <option value="sync">ซิงก์</option>
          <option value="page">เปิดหน้า</option>
        </select>
      </div>
      <table>
        <thead>
          <tr>
            <th>เวลา</th>
            <th>ชื่อ</th>
            <th>เหตุการณ์</th>
            <th>หน้า</th>
          </tr>
        </thead>
        <tbody>
          {logs.length === 0 ? (
            <tr>
              <td colSpan={4} className="muted">
                ยังไม่มีประวัติ
              </td>
            </tr>
          ) : (
            logs.map((row) => (
              <tr key={row.id}>
                <td>{formatWhen(row.at)}</td>
                <td>{row.displayName || row.lineUserId || "—"}</td>
                <td>{ACTION_LABEL[row.action] ?? row.action}</td>
                <td>{row.label || row.path || "—"}</td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
