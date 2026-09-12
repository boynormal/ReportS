"use client";

import { useCallback, useEffect, useState } from "react";
import { formatWhen } from "@/lib/format";
import type { SyncStatus } from "@/lib/sync-types";

const POLL_MS = 30_000;

export function LastSyncStamp() {
  const [status, setStatus] = useState<SyncStatus | null>(null);

  const loadStatus = useCallback(async () => {
    const res = await fetch("/api/sync-status");
    const data = (await res.json()) as SyncStatus & { error?: string };
    if (!res.ok) throw new Error(data.error || "อ่านสถานะ sync ไม่ได้");
    setStatus(data);
  }, []);

  useEffect(() => {
    let cancelled = false;
    const tick = async () => {
      try {
        await loadStatus();
      } catch {
        /* เก็บค่าล่าสุดที่อ่านได้ ถ้า poll รอบนี้พลาด */
      }
    };
    void tick();
    const id = setInterval(() => {
      if (!cancelled) void tick();
    }, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [loadStatus]);

  const running = Boolean(status?.running);
  const finishedAt = status?.finishedAt ?? null;

  return (
    <div
      className={`last-sync-stamp${running ? " last-sync-stamp-running" : ""}`}
      aria-live="polite"
    >
      <span className="last-sync-stamp-label">{running ? "สถานะข้อมูล" : "อัปเดทล่าสุด"}</span>
      <span className="last-sync-stamp-time">
        {running ? "กำลังอัปเดทข้อมูล…" : finishedAt ? formatWhen(finishedAt) : "ยังไม่มีรอบอัปเดท"}
      </span>
    </div>
  );
}
