"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { THAI_MONTHS_SHORT, currentBuddhistYear } from "@/lib/dates";
import { formatDecimal, formatMoney, formatNumber } from "@/lib/format";
import type { TradeLinesResult } from "@/lib/trade-types";

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  const data = (await res.json()) as T & { error?: string };
  if (!res.ok) throw new Error(data.error || res.statusText);
  return data;
}

function scopeLabel(value: string | null, empty = "ทั้งหมด"): string {
  if (!value) return empty;
  if (value === "__none__") return "ไม่ระบุ";
  return value;
}

export function TradeLinesApp() {
  const search = useSearchParams();
  const side = search.get("side") === "out" ? "out" : "in";
  const yearParam = Number(search.get("year"));
  const beYear = Number.isFinite(yearParam) && yearParam >= 2500 ? yearParam : currentBuddhistYear();
  const branch = search.get("branch") || "";
  const itemGroup = search.get("item_group") || "";
  const monthRaw = Number(search.get("month"));
  const month = Number.isInteger(monthRaw) && monthRaw >= 1 && monthRaw <= 12 ? monthRaw : null;
  const metric = search.get("metric") === "weight" ? "weight" : "amount";
  const page = Math.max(Number(search.get("page") || "1") || 1, 1);
  const backBranch = search.get("back_branch") || "";
  const backItemGroup = search.get("back_item_group") || "";
  const sellerId = search.get("seller_id") || "";
  const sellerName = search.get("seller") || "";
  const buyerId = search.get("buyer_id") || "";
  const buyerName = search.get("buyer") || "";

  const backHref = useMemo(() => {
    const p = new URLSearchParams();
    p.set("tab", side);
    p.set("year", String(beYear));
    p.set("metric", metric);
    if (backBranch) p.set("branch", backBranch);
    if (backItemGroup) p.set("item_group", backItemGroup);
    if (side === "in" && sellerId) {
      p.set("seller_id", sellerId);
      if (sellerName) p.set("seller", sellerName);
    }
    if (side === "out" && buyerId) {
      p.set("buyer_id", buyerId);
      if (buyerName) p.set("buyer", buyerName);
    }
    return `/?${p}`;
  }, [side, beYear, metric, backBranch, backItemGroup, sellerId, sellerName, buyerId, buyerName]);

  const apiHref = useMemo(() => {
    const p = new URLSearchParams({ side, year: String(beYear), page: String(page) });
    if (branch) p.set("branch", branch);
    if (itemGroup) p.set("item_group", itemGroup);
    if (side === "in" && sellerId) {
      p.set("seller_id", sellerId);
      if (sellerName) p.set("seller", sellerName);
    }
    if (side === "out" && buyerId) {
      p.set("buyer_id", buyerId);
      if (buyerName) p.set("buyer", buyerName);
    }
    if (month) p.set("month", String(month));
    return `/api/kpis/trade-lines?${p}`;
  }, [side, beYear, branch, itemGroup, sellerId, sellerName, buyerId, buyerName, month, page]);

  const [data, setData] = useState<TradeLinesResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetchJson<TradeLinesResult>(apiHref)
      .then((d) => {
        if (!cancelled) setData(d);
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [apiHref]);

  const pageCount = data ? Math.max(1, Math.ceil(data.totalLines / data.pageSize)) : 1;
  const period = month ? THAI_MONTHS_SHORT[month - 1] : "ทั้งปี";

  function pageHref(nextPage: number): string {
    const p = new URLSearchParams(search.toString());
    p.set("page", String(nextPage));
    return `/trade/lines?${p}`;
  }

  return (
    <div className={`app app-wide trade ${side === "out" ? "theme-out" : "theme-in"}`}>
      <header className="header">
        <div className="trade-title-row">
          <div>
            <h1>รายการ{side === "out" ? "ขายออก" : "ซื้อเข้า"}</h1>
            <div className="sub">
              ปี {beYear} · สาขา {scopeLabel(branch || null)} · รหัสสินค้า {scopeLabel(itemGroup || null)}
              {side === "in" && (sellerName || sellerId) ? ` · ลูกค้า ${sellerName || "1 คน"}` : ""}
              {side === "out" && (buyerName || buyerId) ? ` · ผู้ซื้อ ${buyerName || "1 คน"}` : ""} · {period}
            </div>
          </div>
          <Link className="pill nav-link" href={backHref}>
            กลับตารางสรุป
          </Link>
        </div>
        <div className="note">รายการจ่ายแล้วที่รวมอยู่ในเซลล์ตารางสรุป — นับใบด้วย COUNT(DISTINCT ticket_id) · ยอดและกก. คิดจากน้ำหนักสุทธิ (รวม − หัก − เจือปน)</div>
      </header>

      {error ? <p className="error">{error}</p> : null}
      {loading && !data ? <p className="muted">กำลังโหลดรายการ…</p> : null}

      {data ? (
        <>
          <div className="grid grid-4">
            <div className="card">
              <div className="label">ยอดรวม</div>
              <div className="value">{formatMoney(data.amount)} บาท</div>
            </div>
            <div className="card">
              <div className="label">น้ำหนัก (กก.)</div>
              <div className="value">{formatDecimal(data.weightKg, 2)}</div>
            </div>
            <div className="card">
              <div className="label">จำนวนรายการ</div>
              <div className="value">{formatNumber(data.totalLines)}</div>
            </div>
            <div className="card">
              <div className="label">จำนวนใบ</div>
              <div className="value">{formatNumber(data.totalTickets)}</div>
              <div className="hint">นับจากรายการ ไม่ใช่เจ้าของตั๋ว</div>
            </div>
          </div>

          <div className="panel">
            <div className="pivot-wrap">
              <table>
                <thead>
                  <tr>
                    <th>เลขที่ตั๋ว</th>
                    <th>วันจ่าย</th>
                    <th>รหัส</th>
                    <th>ชื่อ</th>
                    <th>สาขา</th>
                    <th>หมวด</th>
                    <th className="right">รวม</th>
                    <th className="right">หัก</th>
                    <th className="right">เจือปน</th>
                    <th className="right">สุทธิ</th>
                    <th className="right">น้ำหนักกก.</th>
                    <th className="right">ราคาจ่าย</th>
                    <th className="right">ยอดแถว</th>
                  </tr>
                </thead>
                <tbody>
                  {data.rows.length === 0 ? (
                    <tr>
                      <td colSpan={13} className="muted">
                        ไม่มีรายการในช่วงนี้
                      </td>
                    </tr>
                  ) : (
                    data.rows.map((row, idx) => (
                      <tr key={`${row.ticketId}-${row.code ?? "x"}-${idx}`}>
                        <td>
                          <Link href={`/tickets/${side}/${row.ticketId}`}>
                            {row.runningNumber ?? row.ticketNumber ?? row.ticketId.slice(0, 8)}
                          </Link>
                        </td>
                        <td>{row.paidAt ?? "—"}</td>
                        <td>{row.code ?? "—"}</td>
                        <td>{row.name ?? "—"}</td>
                        <td>{row.branchCode ?? "ไม่ระบุ"}</td>
                        <td>{row.itemGroup ?? "ไม่ระบุ"}</td>
                        <td className="right">{formatDecimal(row.weightGross, 2)}</td>
                        <td className="right">{formatDecimal(row.deduct, 2)}</td>
                        <td className="right">{formatDecimal(row.waste, 2)}</td>
                        <td className="right">{formatDecimal(row.weight, 2)}</td>
                        <td className="right">{formatDecimal(row.weightKg, 2)}</td>
                        <td className="right">{formatDecimal(row.paidPrice, 2)}</td>
                        <td className="right">{formatDecimal(row.amount, 2)}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
            {data.totalLines > data.pageSize ? (
              <div className="row panel">
                {page > 1 ? (
                  <Link className="pill" href={pageHref(page - 1)}>
                    ก่อนหน้า
                  </Link>
                ) : null}
                <span className="muted">
                  หน้า {page} / {pageCount}
                </span>
                {page < pageCount ? (
                  <Link className="pill" href={pageHref(page + 1)}>
                    ถัดไป
                  </Link>
                ) : null}
              </div>
            ) : null}
          </div>
        </>
      ) : null}
    </div>
  );
}
