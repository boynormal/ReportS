"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useRef } from "react";

const TAB_LABELS: Record<string, string> = {
  in: "ซื้อเข้า",
  out: "ขายออก",
  profit: "ส่วนต่างขาย−ซื้อ",
  "sales-profit": "กำไรจากการขาย",
  "small-in": "ยอดซื้อต่ำกว่าเกณฑ์",
  "customer-buy": "ซื้อเข้ารายลูกค้า",
  "customer-sell": "ขายออกรายลูกค้า",
  stock: "สต็อก",
  transform: "แปรสภาพ",
  customers: "ลูกค้า",
  "customer-report": "ลูกค้า Report",
  open: "ยังไม่ปิด",
  lookup: "ตรวจตั๋ว",
};

function pageLabel(pathname: string, tab: string | null, side: string | null): string | null {
  if (pathname === "/login" || pathname === "/pending" || pathname.startsWith("/api/")) return null;
  if (pathname === "/users") return "ผู้ใช้แดชบอร์ด";
  if (pathname.startsWith("/tickets/in/")) return "ตั๋วซื้อ";
  if (pathname.startsWith("/tickets/out/")) return "ตั๋วขาย";
  if (pathname.startsWith("/trade/lines")) {
    return side === "out" ? "รายการขายออก" : "รายการซื้อเข้า";
  }
  if (pathname === "/" || pathname === "") {
    return TAB_LABELS[tab || "in"] ?? "แดชบอร์ด";
  }
  return pathname;
}

export function PageViewLogger() {
  const pathname = usePathname();
  const search = useSearchParams();
  const tab = search.get("tab");
  const side = search.get("side");
  const lastKey = useRef<string | null>(null);

  useEffect(() => {
    const label = pageLabel(pathname, tab, side);
    if (!label) return;
    const key = pathname.startsWith("/trade/lines")
      ? `${pathname}|${side ?? "in"}`
      : pathname === "/" || pathname === ""
        ? `${pathname}|${tab || "in"}`
        : pathname;
    if (lastKey.current === key) return;
    lastKey.current = key;
    void fetch("/api/logs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "page", path: key, label }),
    }).catch(() => undefined);
  }, [pathname, tab, side]);

  return null;
}
