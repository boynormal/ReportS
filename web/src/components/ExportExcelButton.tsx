"use client";

import { useSearchParams } from "next/navigation";
import { useState } from "react";

type PageTab =
  | "in"
  | "out"
  | "profit"
  | "lookup"
  | "open"
  | "stock"
  | "customers"
  | "customer-report"
  | "customer-buy"
  | "customer-sell"
  | "small-in"
  | "sales-profit"
  | "transform"
  | "yoy";

export function ExportExcelButton({
  tab,
  disabled,
  extra,
}: {
  tab: PageTab;
  disabled?: boolean;
  extra?: Record<string, string | null | undefined>;
}) {
  const search = useSearchParams();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onClick() {
    setError(null);
    setBusy(true);
    try {
      const qs = new URLSearchParams(search.toString());
      qs.delete("page");
      qs.delete("tab");
      qs.delete("metric");
      qs.delete("kind");
      if (extra) {
        for (const [key, value] of Object.entries(extra)) {
          if (value == null || value === "") qs.delete(key);
          else qs.set(key, value);
        }
      }
      const res = await fetch(`/api/export/${tab}?${qs}`);
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error || "ส่งออกไม่สำเร็จ");
      }
      const blob = await res.blob();
      const header = res.headers.get("Content-Disposition") || "";
      const star = header.match(/filename\*=UTF-8''([^;]+)/i);
      const quoted = header.match(/filename="([^"]+)"/i);
      const filename = decodeURIComponent(star?.[1] || quoted?.[1] || "export.xlsx");
      const href = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = href;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(href);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <span className="export-excel">
      <button type="button" className="pill export-btn" disabled={disabled || busy} onClick={onClick}>
        {busy ? "กำลังส่งออก…" : "Export Excel"}
      </button>
      {error ? <span className="hint">{error}</span> : null}
    </span>
  );
}
