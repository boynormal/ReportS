"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { ExportExcelButton } from "./ExportExcelButton";
import {
  THAI_MONTHS_SHORT,
  currentBuddhistYear,
  fromBuddhistYear,
} from "@/lib/dates";
import { formatMoney, formatNumber, formatWhen } from "@/lib/format";
import { type YearCompareCategory, type YearCompareMetric, type YearCompareResult } from "@/lib/year-compare-types";

type HeatMode = "abs" | "yoy";
type SortKey = "name" | "tickets" | "customers" | "weightKg" | "amount" | "delta";

const METRIC_LABEL: Record<YearCompareMetric, string> = {
  tickets: "ตั๋ว",
  customers: "ลูกค้า",
  weightKg: "น้ำหนัก",
  amount: "ยอดบาท",
};

function parseList(raw: string): string[] {
  return raw ? [...new Set(raw.split(",").map((v) => v.trim()).filter(Boolean))] : [];
}

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(typeof body.error === "string" ? body.error : `HTTP ${res.status}`);
  return body as T;
}

function metricOf(
  row: { tickets: number | null; customers: number | null; weightKg: number | null; amount: number | null },
  metric: YearCompareMetric
): number | null {
  return row[metric];
}

function formatMetric(value: number | null | undefined, metric: YearCompareMetric): string {
  if (value == null) return "—";
  if (metric === "amount") return formatMoney(value);
  if (metric === "weightKg") return `${formatNumber(value, 0)} กก.`;
  if (metric === "customers" || metric === "tickets") return formatNumber(value, 0);
  return formatNumber(value, 0);
}

function formatPct(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "—";
  const sign = value > 0 ? "+" : "";
  return `${sign}${formatNumber(value, 1)}%`;
}

function deltaClass(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value) || value === 0) return "yoy-delta";
  return value > 0 ? "yoy-delta up" : "yoy-delta down";
}

function groupCode(value: string | null | undefined): string {
  return value && value.length > 0 ? value : "ไม่ระบุ";
}

export function YearCompareApp({ dataEpoch }: { dataEpoch: number }) {
  const router = useRouter();
  const search = useSearchParams();
  const yearParam = Number(search.get("year"));
  const beYear = Number.isFinite(yearParam) && yearParam >= 2500 ? yearParam : currentBuddhistYear();
  const compareParam = Number(search.get("compare"));
  const compareBeYear =
    Number.isFinite(compareParam) && compareParam >= 2500 && compareParam !== beYear ? compareParam : beYear - 1;
  const branch = search.get("branch") || "";
  const itemGroups = useMemo(() => parseList(search.get("item_groups") || ""), [search]);
  const includeCurrent = search.get("include_current") === "1";
  const heatMode: HeatMode = search.get("heat") === "yoy" ? "yoy" : "abs";
  const metricRaw = search.get("ymetric");
  const metric: YearCompareMetric =
    metricRaw === "tickets" || metricRaw === "customers" || metricRaw === "weightKg" || metricRaw === "amount"
      ? metricRaw
      : "tickets";

  const setParams = useCallback(
    (patch: Record<string, string | null>) => {
      const next = new URLSearchParams(search.toString());
      next.set("tab", "yoy");
      for (const [k, v] of Object.entries(patch)) {
        if (v === null || v === "") next.delete(k);
        else next.set(k, v);
      }
      router.replace(`/?${next.toString()}`);
    },
    [router, search]
  );

  const [data, setData] = useState<YearCompareResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [sortKey, setSortKey] = useState<SortKey>("delta");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    const qs = new URLSearchParams({
      year: String(fromBuddhistYear(beYear)),
      compare: String(fromBuddhistYear(compareBeYear)),
    });
    if (branch) qs.set("branch", branch);
    if (itemGroups.length) qs.set("item_groups", itemGroups.join(","));
    if (includeCurrent) qs.set("include_current", "1");
    fetchJson<YearCompareResult>(`/api/kpis/year-compare?${qs}`)
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
  }, [beYear, compareBeYear, branch, itemGroups, includeCurrent, dataEpoch]);

  const years = data?.availableBeYears?.length ? data.availableBeYears : [beYear, compareBeYear];
  const ytdLabel =
    data && data.throughMonth >= 1
      ? data.throughMonth === 1
        ? THAI_MONTHS_SHORT[0]
        : `${THAI_MONTHS_SHORT[0]}–${THAI_MONTHS_SHORT[data.throughMonth - 1]}`
      : "";

  const lineData = useMemo(() => {
    if (!data) return [];
    return Array.from({ length: 12 }, (_, i) => ({
      label: THAI_MONTHS_SHORT[i],
      current: metricOf(data.monthly.current[i] ?? { tickets: null, customers: null, weightKg: null, amount: null }, metric),
      previous: metricOf(data.monthly.previous[i] ?? { tickets: null, customers: null, weightKg: null, amount: null }, metric),
    }));
  }, [data, metric]);

  const sortedCats = useMemo(() => {
    if (!data) return [];
    const rows = [...data.categories];
    const mul = sortDir === "asc" ? 1 : -1;
    rows.sort((a, b) => {
      if (sortKey === "name") return groupCode(a.itemGroup).localeCompare(groupCode(b.itemGroup), "th", { numeric: true }) * mul;
      if (sortKey === "delta") {
        const av = a.changePct[metric];
        const bv = b.changePct[metric];
        if (av == null && bv == null) return 0;
        if (av == null) return 1;
        if (bv == null) return -1;
        return (av - bv) * mul;
      }
      return (a.current[sortKey] - b.current[sortKey]) * mul;
    });
    return rows;
  }, [data, sortKey, sortDir, metric]);

  const barData = useMemo(
    () =>
      sortedCats
        .filter((row) => row.current[metric] !== 0 || row.previous[metric] !== 0)
        .slice(0, 18)
        .map((row) => ({
          name: row.itemGroup || "ไม่ระบุ",
          current: row.current[metric],
          previous: row.previous[metric],
        })),
    [sortedCats, metric]
  );

  const movers = useMemo(() => {
    const ranked = (data?.categories ?? [])
      .map((row) => ({ row, pct: row.changePct[metric] }))
      .filter((x) => x.pct != null && (x.row.current[metric] > 0 || x.row.previous[metric] > 0)) as Array<{
      row: YearCompareCategory;
      pct: number;
    }>;
    const up = [...ranked].sort((a, b) => b.pct - a.pct).filter((x) => x.pct > 0).slice(0, 3);
    const down = [...ranked].sort((a, b) => a.pct - b.pct).filter((x) => x.pct < 0).slice(0, 3);
    return { up, down };
  }, [data, metric]);

  function onSort(key: SortKey) {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(key);
      setSortDir(key === "name" ? "asc" : "desc");
    }
  }

  const kpis = data
    ? [
        { key: "tickets" as const, label: "จำนวนตั๋ว", value: data.kpis.current.tickets, prev: data.kpis.previous.tickets, pct: data.kpis.changePct.tickets, format: (n: number) => formatNumber(n, 0) },
        { key: "customers" as const, label: "ลูกค้าไม่ซ้ำ", value: data.kpis.current.customers, prev: data.kpis.previous.customers, pct: data.kpis.changePct.customers, format: (n: number) => formatNumber(n, 0) },
        { key: "weightKg" as const, label: "น้ำหนัก", value: data.kpis.current.weightKg, prev: data.kpis.previous.weightKg, pct: data.kpis.changePct.weightKg, format: (n: number) => `${formatNumber(n, 0)} กก.` },
        { key: "amount" as const, label: "ยอดบาท", value: data.kpis.current.amount, prev: data.kpis.previous.amount, pct: data.kpis.changePct.amount, format: (n: number) => formatMoney(n) },
        { key: "ticketsPerCustomer" as const, label: "ตั๋วต่อลูกค้า", value: data.kpis.current.ticketsPerCustomer, prev: data.kpis.previous.ticketsPerCustomer, pct: data.kpis.changePct.ticketsPerCustomer, format: (n: number) => formatNumber(n, 2) },
      ]
    : [];

  return (
    <>
      <div className="row trade-toolbar">
        <label className="muted">
          ปีปัจจุบัน{" "}
          <select value={beYear} onChange={(e) => setParams({ year: e.target.value })}>
            {[beYear, ...years.filter((y) => y !== beYear)].sort((a, b) => b - a).map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
        </label>
        <label className="muted">
          ปีเทียบ{" "}
          <select value={compareBeYear} onChange={(e) => setParams({ compare: e.target.value })}>
            {[compareBeYear, beYear - 1, ...years.filter((y) => y !== compareBeYear && y !== beYear)]
              .filter((y, i, arr) => arr.indexOf(y) === i)
              .sort((a, b) => b - a)
              .map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
          </select>
        </label>
        <label className="muted">
          สาขา{" "}
          <select value={branch} onChange={(e) => setParams({ branch: e.target.value || null })}>
            <option value="">ทุกสาขา</option>
            {uniqueCodes(data?.branches, branch).map((code) => (
              <option key={code} value={code}>
                {code}
              </option>
            ))}
          </select>
        </label>
        <MultiCheck
          label="หมวด"
          allLabel="ทุกหมวด"
          options={uniqueCodes(data?.itemGroups, ...itemGroups)}
          selected={itemGroups}
          onChange={(next) => setParams({ item_groups: next.length ? next.join(",") : null })}
        />
        <div className="metric-toggle">
          {(Object.keys(METRIC_LABEL) as YearCompareMetric[]).map((key) => (
            <button key={key} className={`pill ${metric === key ? "active" : ""}`} onClick={() => setParams({ ymetric: key })}>
              {METRIC_LABEL[key]}
            </button>
          ))}
        </div>
        <button
          type="button"
          className={`pill ${includeCurrent ? "active" : ""}`}
          onClick={() => setParams({ include_current: includeCurrent ? null : "1" })}
        >
          รวมเดือนปัจจุบัน
        </button>
        <ExportExcelButton
          tab="yoy"
          disabled={loading}
          extra={{
            compare: String(compareBeYear),
            include_current: includeCurrent ? "1" : null,
            item_groups: itemGroups.join(","),
            branch,
          }}
        />
      </div>

      {error ? <p className="error">{error}</p> : null}
      {loading && !data ? <p className="muted">กำลังโหลดเทียบปี {compareBeYear} กับ {beYear}…</p> : null}

      {data ? (
        <>
          <div className={`note yoy-banner ${data.previousMissing ? "warn" : ""}`}>
            {data.completeness.currentLabel}
            {data.lastPaidAt ? ` · จ่ายล่าสุด ${formatWhen(data.lastPaidAt)}` : ""}
            {" · "}
            {data.previousMissing
              ? `ปี ${data.compareBeYear} ยังไม่มีในคลัง — เทียบ YTD ไม่ได้จนกว่าจะ sync ปีนั้น`
              : `${data.completeness.previousLabel} · เทียบ YTD ${ytdLabel} ทั้งสองปี`}
            {data.includeCurrentMonth ? " · รวมเดือนปัจจุบันที่ยังไม่จบ" : " · ไม่รวมเดือนปัจจุบัน"}
            <div className="sub">{data.note}</div>
          </div>

          <div className="grid grid-5 yoy-kpis">
            {kpis.map((card) => (
              <div key={card.key} className="card kpi-card">
                <div className="label">{card.label}</div>
                <div className="value">{card.format(card.value)}</div>
                <div className={deltaClass(card.pct)}>
                  {data.previousMissing ? `ปี ${data.compareBeYear} ไม่มีข้อมูล` : `${formatPct(card.pct)} vs ${card.format(card.prev)}`}
                </div>
              </div>
            ))}
          </div>

          <div className="card panel chart-card">
            <div className="label">
              รายเดือน · {METRIC_LABEL[metric]} · ปี {data.compareBeYear} (ทึบ) vs ปี {data.beYear} (ประ)
            </div>
            <ResponsiveContainer width="100%" height={280}>
              <LineChart data={lineData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#d9d2c5" />
                <XAxis dataKey="label" tick={{ fontSize: 12 }} />
                <YAxis width={72} tick={{ fontSize: 11 }} tickFormatter={(v) => formatNumber(Number(v), 0)} />
                <Tooltip
                  formatter={(v, name) => [
                    formatMetric(v == null ? null : Number(v), metric),
                    name === "previous" ? String(data.compareBeYear) : String(data.beYear),
                  ]}
                />
                <Legend formatter={(v) => (v === "previous" ? String(data.compareBeYear) : String(data.beYear))} />
                <Line type="monotone" dataKey="previous" stroke="#8b7355" strokeWidth={2} connectNulls={false} dot={false} />
                <Line type="monotone" dataKey="current" stroke="#1d4f91" strokeWidth={2} strokeDasharray="6 4" connectNulls={false} dot />
              </LineChart>
            </ResponsiveContainer>
          </div>

          <div className="yoy-movers">
            <div className="card panel">
              <div className="label">โตแรงสุด 3 หมวด · {METRIC_LABEL[metric]}</div>
              {movers.up.length === 0 ? <p className="muted">ยังไม่มีหมวดที่โต</p> : null}
              {movers.up.map(({ row, pct }) => (
                <div key={`up-${row.itemGroup}`} className="yoy-mover">
                  <strong>{groupCode(row.itemGroup)}</strong>
                  <span className="yoy-delta up">{formatPct(pct)}</span>
                </div>
              ))}
            </div>
            <div className="card panel">
              <div className="label">หดตัวแรงสุด 3 หมวด · {METRIC_LABEL[metric]}</div>
              {movers.down.length === 0 ? <p className="muted">ยังไม่มีหมวดที่หด</p> : null}
              {movers.down.map(({ row, pct }) => (
                <div key={`down-${row.itemGroup}`} className="yoy-mover">
                  <strong>{groupCode(row.itemGroup)}</strong>
                  <span className="yoy-delta down">{formatPct(pct)}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="card panel chart-card">
            <div className="label">หมวดหมู่ YTD {ytdLabel} · {METRIC_LABEL[metric]}</div>
            <ResponsiveContainer width="100%" height={Math.max(280, barData.length * 28)}>
              <BarChart data={barData} layout="vertical" margin={{ left: 48 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#d9d2c5" />
                <XAxis type="number" tickFormatter={(v) => formatNumber(Number(v), 0)} />
                <YAxis type="category" dataKey="name" width={64} tick={{ fontSize: 11 }} />
                <Tooltip formatter={(v, name) => [formatMetric(Number(v), metric), name === "previous" ? String(data.compareBeYear) : String(data.beYear)]} />
                <Legend formatter={(v) => (v === "previous" ? String(data.compareBeYear) : String(data.beYear))} />
                <Bar dataKey="previous" fill="#c4b8a5" />
                <Bar dataKey="current" fill="#1d4f91" />
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div className="panel">
            <h2>ตารางหมวดหมู่ · YTD {ytdLabel}</h2>
            <div className="pivot-wrap">
              <table className="pivot yoy-table">
                <thead>
                  <tr>
                    <SortTh label="หมวด" sortKey="name" current={sortKey} dir={sortDir} onSort={onSort} />
                    <SortTh label={`ตั๋ว ${data.compareBeYear}`} sortKey="tickets" current={sortKey} dir={sortDir} onSort={onSort} className="right" />
                    <th className="right">ตั๋ว {data.beYear}</th>
                    <th className="right">%Δ ตั๋ว</th>
                    <SortTh label={`ลูกค้า ${data.compareBeYear}`} sortKey="customers" current={sortKey} dir={sortDir} onSort={onSort} className="right" />
                    <th className="right">ลูกค้า {data.beYear}</th>
                    <th className="right">%Δ ลูกค้า</th>
                    <SortTh label={`กก. ${data.compareBeYear}`} sortKey="weightKg" current={sortKey} dir={sortDir} onSort={onSort} className="right" />
                    <th className="right">กก. {data.beYear}</th>
                    <th className="right">%Δ กก.</th>
                    <SortTh label={`บาท ${data.compareBeYear}`} sortKey="amount" current={sortKey} dir={sortDir} onSort={onSort} className="right" />
                    <th className="right">บาท {data.beYear}</th>
                    <SortTh label="%Δ เมตริก" sortKey="delta" current={sortKey} dir={sortDir} onSort={onSort} className="right" />
                  </tr>
                </thead>
                <tbody>
                  {sortedCats.map((row) => (
                    <tr key={row.itemGroup ?? "none"}>
                      <td>{groupCode(row.itemGroup)}</td>
                      <td className="right">{formatNumber(row.previous.tickets, 0)}</td>
                      <td className="right">{formatNumber(row.current.tickets, 0)}</td>
                      <td className={`right ${deltaClass(row.changePct.tickets)}`}>{formatPct(row.changePct.tickets)}</td>
                      <td className="right">{formatNumber(row.previous.customers, 0)}</td>
                      <td className="right">{formatNumber(row.current.customers, 0)}</td>
                      <td className={`right ${deltaClass(row.changePct.customers)}`}>{formatPct(row.changePct.customers)}</td>
                      <td className="right">{formatNumber(row.previous.weightKg, 0)}</td>
                      <td className="right">{formatNumber(row.current.weightKg, 0)}</td>
                      <td className={`right ${deltaClass(row.changePct.weightKg)}`}>{formatPct(row.changePct.weightKg)}</td>
                      <td className="right">{formatMoney(row.previous.amount)}</td>
                      <td className="right">{formatMoney(row.current.amount)}</td>
                      <td className={`right ${deltaClass(row.changePct[metric])}`}>{formatPct(row.changePct[metric])}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="panel">
            <div className="row" style={{ justifyContent: "space-between" }}>
              <h2>รายเดือน × หมวด · {METRIC_LABEL[metric]}</h2>
              <div className="metric-toggle">
                <button className={`pill ${heatMode === "abs" ? "active" : ""}`} onClick={() => setParams({ heat: null })}>
                  ค่าจริง
                </button>
                <button className={`pill ${heatMode === "yoy" ? "active" : ""}`} onClick={() => setParams({ heat: "yoy" })}>
                  % YoY
                </button>
              </div>
            </div>
            <Heatmap data={data} metric={metric} mode={heatMode} />
          </div>

          <div className="panel">
            <h2>แนวโน้มรายหมวด</h2>
            <div className="yoy-sparks">
              {sortedCats.map((row) => (
                <Spark key={row.itemGroup ?? "none"} row={row} metric={metric} beYear={data.beYear} compareBeYear={data.compareBeYear} />
              ))}
            </div>
          </div>
        </>
      ) : null}
    </>
  );
}

function Heatmap({
  data,
  metric,
  mode,
}: {
  data: YearCompareResult;
  metric: YearCompareMetric;
  mode: HeatMode;
}) {
  const values: number[] = [];
  for (const row of data.categories) {
    for (let m = 0; m < 12; m++) {
      const cur = metricOf(row.currentMonths[m] ?? emptyMonth(m + 1), metric);
      const prev = metricOf(row.previousMonths[m] ?? emptyMonth(m + 1), metric);
      if (mode === "yoy") {
        if (cur == null || prev == null || prev === 0) continue;
        values.push(((cur - prev) / prev) * 100);
      } else if (cur != null) values.push(cur);
    }
  }
  const maxAbs = values.reduce((m, v) => Math.max(m, Math.abs(v)), 0) || 1;
  const maxPos = values.reduce((m, v) => Math.max(m, v), 0) || 1;

  return (
    <div className="pivot-wrap">
      <table className="pivot yoy-heat">
        <thead>
          <tr>
            <th>หมวด</th>
            {THAI_MONTHS_SHORT.map((label) => (
              <th key={label} className="right">
                {label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.categories.map((row) => (
            <tr key={row.itemGroup ?? "none"}>
              <td>{groupCode(row.itemGroup)}</td>
              {Array.from({ length: 12 }, (_, m) => {
                const cur = metricOf(row.currentMonths[m] ?? emptyMonth(m + 1), metric);
                const prev = metricOf(row.previousMonths[m] ?? emptyMonth(m + 1), metric);
                if (mode === "yoy") {
                  if (cur == null || prev == null) return <td key={m} className="right yoy-heat-empty">—</td>;
                  if (prev === 0) return <td key={m} className="right yoy-heat-empty">{cur === 0 ? "—" : "ใหม่"}</td>;
                  const pct = ((cur - prev) / prev) * 100;
                  return (
                    <td key={m} className="right" style={{ background: heatYoy(pct, maxAbs) }}>
                      {formatPct(pct)}
                    </td>
                  );
                }
                if (cur == null) return <td key={m} className="right yoy-heat-empty">—</td>;
                return (
                  <td key={m} className="right" style={{ background: heatAbs(cur, maxPos) }}>
                    {formatMetric(cur, metric)}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Spark({
  row,
  metric,
  beYear,
  compareBeYear,
}: {
  row: YearCompareCategory;
  metric: YearCompareMetric;
  beYear: number;
  compareBeYear: number;
}) {
  const data = THAI_MONTHS_SHORT.map((label, i) => ({
    label,
    current: metricOf(row.currentMonths[i] ?? emptyMonth(i + 1), metric),
    previous: metricOf(row.previousMonths[i] ?? emptyMonth(i + 1), metric),
  }));
  return (
    <div className="card yoy-spark">
      <div className="label">{groupCode(row.itemGroup)}</div>
      <ResponsiveContainer width="100%" height={80}>
        <LineChart data={data}>
          <Line type="monotone" dataKey="previous" stroke="#8b7355" strokeWidth={1.5} dot={false} connectNulls={false} />
          <Line type="monotone" dataKey="current" stroke="#1d4f91" strokeWidth={1.5} strokeDasharray="4 3" dot={false} connectNulls={false} />
        </LineChart>
      </ResponsiveContainer>
      <div className="sub">
        {compareBeYear} ทึบ · {beYear} ประ · {formatPct(row.changePct[metric])}
      </div>
    </div>
  );
}

function emptyMonth(month: number) {
  return { month, tickets: null, customers: null, weightKg: null, amount: null };
}

function heatAbs(value: number, max: number): string {
  const t = Math.min(1, Math.max(0, value / max));
  return `rgba(29, 79, 145, ${0.08 + t * 0.45})`;
}

function heatYoy(pct: number, maxAbs: number): string {
  const t = Math.min(1, Math.abs(pct) / maxAbs);
  if (pct >= 0) return `rgba(31, 107, 58, ${0.08 + t * 0.45})`;
  return `rgba(139, 30, 30, ${0.08 + t * 0.45})`;
}

function uniqueCodes(list?: string[] | null, ...extra: string[]): string[] {
  return [...new Set([...(list ?? []), ...extra].filter(Boolean))].sort((a, b) => a.localeCompare(b, "th", { numeric: true }));
}

function SortTh({
  label,
  sortKey,
  current,
  dir,
  onSort,
  className,
}: {
  label: string;
  sortKey: SortKey;
  current: SortKey;
  dir: "asc" | "desc";
  onSort: (key: SortKey) => void;
  className?: string;
}) {
  const active = current === sortKey;
  return (
    <th className={`sortable ${className ?? ""}`.trim()} onClick={() => onSort(sortKey)}>
      <button type="button" className="sort-th">
        {label}
        <span className="sort-mark">{active ? (dir === "asc" ? " ▲" : " ▼") : " ↕"}</span>
      </button>
    </th>
  );
}

function MultiCheck({
  label,
  allLabel,
  options,
  selected,
  onChange,
}: {
  label: string;
  allLabel: string;
  options: string[];
  selected: string[];
  onChange: (next: string[]) => void;
}) {
  const boxRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const chosen = new Set(selected);
  const summary =
    selected.length === 0 ? allLabel : selected.length <= 2 ? selected.join(", ") : `${selected.length} หมวด`;

  useEffect(() => {
    if (!open) return;
    function onDoc(ev: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(ev.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  return (
    <div className="muted multi-filter" ref={boxRef}>
      {label}{" "}
      <button type="button" className={`multi-filter-btn ${selected.length ? "active" : ""}`} onClick={() => setOpen((v) => !v)}>
        {summary}
      </button>
      {open ? (
        <div className="multi-filter-menu">
          <label className="multi-filter-item">
            <input type="checkbox" checked={selected.length === 0} onChange={() => onChange([])} />
            {allLabel}
          </label>
          {options.map((code) => (
            <label key={code} className="multi-filter-item">
              <input
                type="checkbox"
                checked={chosen.has(code)}
                onChange={() => onChange(chosen.has(code) ? selected.filter((v) => v !== code) : [...selected, code])}
              />
              {code}
            </label>
          ))}
        </div>
      ) : null}
    </div>
  );
}
