"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { SyncStatus } from "@/lib/sync-types";

async function readJson<T>(url: string, init?: RequestInit): Promise<{ ok: boolean; status: number; data: T & { error?: string } }> {
  const res = await fetch(url, init);
  const data = (await res.json()) as T & { error?: string };
  return { ok: res.ok, status: res.status, data };
}

function authHint(error: string | null): string | null {
  if (!error) return null;
  const lower = error.toLowerCase();
  if (
    lower.includes("app check") ||
    lower.includes("permission") ||
    lower.includes("401") ||
    lower.includes("token") ||
    lower.includes("เข้าสู่ระบบ")
  ) {
    return "ดูหน้าต่าง Chrome ที่เปิดขึ้น เข้าบัญชี Scrapee ให้จบ หรือรัน npm run auth ที่เครื่อง แล้วกดอัปเดทอีกครั้ง";
  }
  return null;
}

export function SyncButton({ onSynced }: { onSynced?: () => void }) {
  const [status, setStatus] = useState<SyncStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const seenRunning = useRef(false);
  const onSyncedRef = useRef(onSynced);
  onSyncedRef.current = onSynced;

  const loadStatus = useCallback(async () => {
    const { ok, data } = await readJson<SyncStatus>("/api/sync-status");
    if (!ok) throw new Error(data.error || "อ่านสถานะ sync ไม่ได้");
    setStatus(data);
    return data;
  }, []);

  useEffect(() => {
    let cancelled = false;
    loadStatus()
      .then((s) => {
        if (cancelled) return;
        if (s.running) {
          seenRunning.current = true;
          setBusy(true);
        }
      })
      .catch((e) => {
        if (!cancelled) setLocalError(e instanceof Error ? e.message : String(e));
      });
    return () => {
      cancelled = true;
    };
  }, [loadStatus]);

  useEffect(() => {
    if (!busy) return;
    let cancelled = false;
    const tick = async () => {
      try {
        const s = await loadStatus();
        if (cancelled) return;
        if (s.running) {
          seenRunning.current = true;
          return;
        }
        if (seenRunning.current) {
          seenRunning.current = false;
          setBusy(false);
          onSyncedRef.current?.();
        }
      } catch (e) {
        if (!cancelled) setLocalError(e instanceof Error ? e.message : String(e));
      }
    };
    const id = setInterval(tick, 2500);
    void tick();
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [busy, loadStatus]);

  async function start() {
    setLocalError(null);
    setBusy(true);
    const { ok, status: http, data } = await readJson<{ started?: boolean }>("/api/sync", { method: "POST" });
    if (http === 409) return;
    if (!ok) {
      setBusy(false);
      seenRunning.current = false;
      setLocalError(data.error || "เริ่มอัปเดทไม่สำเร็จ");
      return;
    }
    seenRunning.current = true;
  }

  const error = localError || (!busy && status?.error ? status.error : null);
  const hint = authHint(error);

  return (
    <div className="sync-box">
      {busy ? (
        <div className="hint">อาจเปิด Chrome สั้นๆ เหมือน sync-auto แล้วค่อยดึงข้อมูล — รอจนจบแล้วจะรีโหลดหน้านี้</div>
      ) : null}
      {error ? <div className="error">{error}</div> : null}
      {hint ? <div className="hint">{hint}</div> : null}
      <button className="pill" type="button" disabled={busy} onClick={() => void start()}>
        {busy ? "กำลังเข้า Scrapee แล้วดึงข้อมูล…" : "อัปเดทข้อมูล"}
      </button>
    </div>
  );
}
