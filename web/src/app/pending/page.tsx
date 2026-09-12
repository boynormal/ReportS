"use client";

import { useEffect, useState } from "react";
import type { SessionUser } from "@/lib/auth-types";

export default function PendingPage() {
  const [me, setMe] = useState<SessionUser | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);

  async function load() {
    const res = await fetch("/api/auth/me");
    const data = (await res.json()) as SessionUser & { error?: string };
    if (!res.ok) throw new Error(data.error || "อ่านสถานะไม่สำเร็จ");
    return data;
  }

  useEffect(() => {
    load()
      .then(setMe)
      .catch((e) => {
        const message = e instanceof Error ? e.message : String(e);
        if (message.includes("เข้าสู่ระบบ")) {
          window.location.href = "/login";
          return;
        }
        setError(message);
      });
  }, []);

  async function checkAgain() {
    setChecking(true);
    setError(null);
    try {
      const data = await load();
      setMe(data);
      if (data.status === "active") {
        window.location.href = "/";
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setChecking(false);
    }
  }

  return (
    <div className="app login-page">
      <div className="card login-card">
        <h1>รออนุมัติ</h1>
        <p className="muted">
          {me?.name ? `${me.name} · ` : ""}
          แอดมินต้องอนุมัติบัญชีนี้ก่อนจึงจะดูรายงานได้
        </p>
        {error ? <p className="error">{error}</p> : null}
        <div className="row">
          <button className="pill" type="button" disabled={checking} onClick={() => void checkAgain()}>
            {checking ? "กำลังตรวจ…" : "ตรวจอีกครั้ง"}
          </button>
          <a className="pill" href="/api/auth/logout">
            ออกจากระบบ
          </a>
        </div>
      </div>
    </div>
  );
}
