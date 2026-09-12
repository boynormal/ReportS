"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type { DashboardRole, SessionUser } from "@/lib/auth-types";
import { canSync, isAdmin } from "@/lib/auth-types";
import { SyncButton } from "./SyncButton";

const ROLE_LABEL: Record<DashboardRole, string> = {
  viewer: "ดูรายงาน",
  sync: "ซิงก์ได้",
  admin: "แอดมิน",
};

function readableName(name: string | undefined | null): string | null {
  const trimmed = name?.trim() ?? "";
  if (!trimmed) return null;
  const letters = trimmed.match(/[\p{L}\p{N}]/gu)?.length ?? 0;
  if (letters === 0 || letters / trimmed.length < 0.3) return null;
  return trimmed;
}

function accountInitial(name: string | null): string {
  if (!name) return "บ";
  return [...name][0]?.toUpperCase() ?? "บ";
}

export function SessionBar({ onSynced }: { onSynced?: () => void }) {
  const [me, setMe] = useState<SessionUser | null>(null);
  const [open, setOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/auth/me")
      .then(async (res) => {
        const data = (await res.json()) as SessionUser & { error?: string };
        if (!res.ok) throw new Error(data.error || "session");
        return data;
      })
      .then((user) => {
        if (!cancelled) setMe(user);
      })
      .catch(() => {
        if (!cancelled) setMe(null);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!open) return;
    function onPointer(event: MouseEvent) {
      if (!boxRef.current?.contains(event.target as Node)) setOpen(false);
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const name = readableName(me?.name);

  return (
    <div className="header-actions session-bar">
      {canSync(me?.role) ? <SyncButton onSynced={onSynced} /> : null}
      <div className="account-menu" ref={boxRef}>
        <button
          type="button"
          className="account-menu-btn"
          aria-expanded={open}
          aria-haspopup="menu"
          onClick={() => setOpen((value) => !value)}
        >
          {accountInitial(name)}
        </button>
        {open ? (
          <div className="account-menu-panel" role="menu">
            <div className="account-menu-who">
              <div className="account-menu-name">{name ?? "บัญชี"}</div>
              <div className="muted">{me?.role ? ROLE_LABEL[me.role] : "—"}</div>
            </div>
            {isAdmin(me?.role) ? (
              <Link className="account-menu-item" href="/users" role="menuitem" onClick={() => setOpen(false)}>
                ผู้ใช้
              </Link>
            ) : null}
            <a className="account-menu-item" href="/api/auth/logout" role="menuitem">
              ออกจากระบบ
            </a>
          </div>
        ) : null}
      </div>
    </div>
  );
}
