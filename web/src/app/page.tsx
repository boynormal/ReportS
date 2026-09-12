import { Suspense } from "react";
import { TradeSummaryApp } from "@/components/TradeSummaryApp";

export default function HomePage() {
  return (
    <Suspense fallback={<p className="app">กำลังโหลดสรุปซื้อ-ขาย…</p>}>
      <TradeSummaryApp />
    </Suspense>
  );
}
