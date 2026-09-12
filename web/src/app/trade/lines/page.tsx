import { Suspense } from "react";
import { TradeLinesApp } from "@/components/TradeLinesApp";

export default function TradeLinesPage() {
  return (
    <Suspense fallback={<p className="app">กำลังโหลดรายการ…</p>}>
      <TradeLinesApp />
    </Suspense>
  );
}
