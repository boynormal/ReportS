"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  THAI_MONTHS_SHORT,
  currentBuddhistYear,
  currentCeMonth,
  currentCeYear,
  fromBuddhistYear,
  sqlDay,
  toBuddhistYear,
} from "@/lib/dates";
import { formatDecimal, formatHours, formatMoney, formatNumber, formatWhen } from "@/lib/format";
import { ExportExcelButton } from "./ExportExcelButton";
import { PageHelpButton } from "./PageHelpButton";
import { SessionBar } from "./SessionBar";
import type { CustomerPurchasesResult } from "@/lib/customer-purchase-types";
import type { CustomerReportKind, CustomerReportKpi, CustomerReportPerson, CustomerReportResult } from "@/lib/customer-report-types";
import type { CustomerRow, CustomersResult, SellerChoice } from "@/lib/customer-types";
import { CUSTOMER_SILENT_BUCKETS } from "@/lib/customer-types";
import type { SmallInCap, SmallInResult } from "@/lib/small-in-types";
import { SMALL_IN_CAPS, SMALL_IN_NONE } from "@/lib/small-in-types";
import type { SalesProfitResult } from "@/lib/sales-profit-types";
import type { StockProduct, StockResult } from "@/lib/stock-types";
import type { OpenTicketsResult } from "@/lib/ticket-open-types";
import type { TicketLookupResult } from "@/lib/ticket-lookup-types";
import type { StockTransformsResult } from "@/lib/transform-types";
import type { TradePivotRow, TradeSide, TradeSummary } from "@/lib/trade-types";

type Metric = "amount" | "weight";
type PageTab = TradeSide | "lookup" | "open" | "stock" | "transform" | "customers" | "customer-report" | "customer-buy" | "customer-sell" | "small-in" | "sales-profit";
type OpenSide = "all" | "in" | "out";

const TAB_META: Record<PageTab, { label: string; theme: string }> = {
  in: { label: "ซื้อเข้า", theme: "theme-in" },
  out: { label: "ขายออก", theme: "theme-out" },
  profit: { label: "ส่วนต่างขาย−ซื้อ", theme: "theme-profit" },
  "sales-profit": { label: "กำไรจากการขาย", theme: "theme-profit" },
  "small-in": { label: "ยอดซื้อต่ำกว่าเกณฑ์", theme: "theme-in" },
  "customer-buy": { label: "ซื้อเข้ารายลูกค้า", theme: "theme-in" },
  "customer-sell": { label: "ขายออกรายลูกค้า", theme: "theme-out" },
  stock: { label: "สต็อก", theme: "theme-stock" },
  transform: { label: "แปรสภาพ", theme: "theme-stock" },
  customers: { label: "ลูกค้า", theme: "theme-customers" },
  "customer-report": { label: "ลูกค้า Report", theme: "theme-customers" },
  open: { label: "ยังไม่ปิด", theme: "theme-open" },
  lookup: { label: "ตรวจตั๋ว", theme: "theme-lookup" },
};

const NAV_GROUPS: Array<{ title: string; tabs: PageTab[] }> = [
  { title: "ซื้อ–ขาย", tabs: ["in", "out", "profit", "sales-profit", "small-in"] },
  { title: "ลูกค้า", tabs: ["customers", "customer-report", "customer-buy", "customer-sell"] },
  { title: "คลัง", tabs: ["stock", "transform"] },
  { title: "ปฏิบัติการ", tabs: ["open", "lookup"] },
];

const LINE_COLORS = [
  "#1d4f91",
  "#c45c26",
  "#1f6b3a",
  "#8b3d6b",
  "#3d5a80",
  "#b45309",
  "#0f766e",
  "#7c3aed",
  "#be123c",
  "#0369a1",
  "#4d7c0f",
  "#9333ea",
  "#0e7490",
  "#a16207",
  "#334155",
  "#ea580c",
  "#166534",
  "#6d28d9",
];

function isTradeSide(tab: PageTab): tab is TradeSide {
  return tab === "in" || tab === "out" || tab === "profit";
}

function defaultFocusMonth(ceYear: number): number {
  return ceYear === currentCeYear() ? currentCeMonth() : 12;
}

function shiftFocusMonth(ceYear: number, month: number, delta: number): { ceYear: number; month: number } {
  const idx = ceYear * 12 + (month - 1) + delta;
  return { ceYear: Math.floor(idx / 12), month: (idx % 12) + 1 };
}

function metricValue(row: { amount: number; weightKg: number }, metric: Metric): number {
  return metric === "weight" ? row.weightKg : row.amount;
}

function formatMetric(value: number, metric: Metric): string {
  return formatNumber(value, 0);
}

function formatCompact(value: number, metric: Metric): string {
  if (metric === "weight") return `${formatNumber(value, 0)} กก.`;
  return `${formatMoney(value)} บาท`;
}

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  const data = (await res.json()) as T & { error?: string };
  if (!res.ok) throw new Error(data.error || res.statusText);
  return data;
}

function sellerChoiceLabel(row: SellerChoice): string {
  return row.name?.trim() || row.code || row.sellerId;
}

function sellerChoiceMeta(row: SellerChoice): string {
  return [row.code, row.tel].filter((value) => value && value.trim()).join(" · ");
}

function SellerPicker({
  sellerId,
  sellerName,
  endpoint,
  onSelect,
}: {
  sellerId: string;
  sellerName: string;
  endpoint: string;
  onSelect: (choice: SellerChoice | null) => void;
}) {
  const boxRef = useRef<HTMLDivElement>(null);
  const [draft, setDraft] = useState(sellerName);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState<SellerChoice[]>([]);
  const [active, setActive] = useState(0);
  const selected = Boolean(sellerId);

  useEffect(() => {
    if (!open) setDraft(sellerName);
  }, [sellerName, sellerId, open]);

  useEffect(() => {
    if (!sellerId || sellerName) return;
    let cancelled = false;
    fetchJson<{ rows: SellerChoice[] }>(`${endpoint}?id=${encodeURIComponent(sellerId)}`)
      .then((data) => {
        if (cancelled) return;
        const found = data.rows[0];
        if (found) setDraft(sellerChoiceLabel(found));
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [sellerId, sellerName, endpoint]);

  useEffect(() => {
    if (!open) return;
    const q = draft.trim();
    if (!q) {
      setRows([]);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    const handle = window.setTimeout(() => {
      fetchJson<{ rows: SellerChoice[] }>(`${endpoint}?q=${encodeURIComponent(q)}`)
        .then((data) => {
          if (cancelled) return;
          setRows(data.rows);
          setActive(data.rows.length === 1 ? 0 : -1);
        })
        .catch(() => {
          if (!cancelled) setRows([]);
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
    }, 250);
    return () => {
      cancelled = true;
      window.clearTimeout(handle);
    };
  }, [draft, open, endpoint]);

  useEffect(() => {
    if (!open) return;
    function onDoc(ev: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(ev.target as Node)) {
        setOpen(false);
        setDraft(sellerName);
      }
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open, sellerName]);

  function pick(row: SellerChoice) {
    onSelect(row);
    setDraft(sellerChoiceLabel(row));
    setOpen(false);
  }

  function clear() {
    onSelect(null);
    setDraft("");
    setRows([]);
    setOpen(false);
  }

  return (
    <div className="seller-pick" ref={boxRef}>
      <label className="muted">
        ค้นชื่อ{" "}
        <span className="seller-pick-field">
          <input
            type="text"
            role="combobox"
            aria-expanded={open}
            aria-autocomplete="list"
            placeholder="พิมพ์แล้วเลือก 1 คน"
            value={draft}
            onFocus={() => setOpen(true)}
            onChange={(e) => {
              const next = e.target.value;
              setDraft(next);
              setOpen(true);
              if (!next.trim() && sellerId) clear();
            }}
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                setOpen(false);
                setDraft(sellerName);
                return;
              }
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setOpen(true);
                setActive((n) => {
                  const max = Math.max(rows.length - 1, 0);
                  return n < 0 ? 0 : Math.min(n + 1, max);
                });
                return;
              }
              if (e.key === "ArrowUp") {
                e.preventDefault();
                setActive((n) => (n < 0 ? 0 : Math.max(n - 1, 0)));
                return;
              }
              if (e.key === "Enter") {
                e.preventDefault();
                if (rows.length === 1) pick(rows[0]);
                else if (active >= 0 && rows[active]) pick(rows[active]);
              }
            }}
          />
          {selected ? (
            <button type="button" className="seller-pick-clear" onClick={clear} aria-label="ล้างลูกค้า">
              ×
            </button>
          ) : null}
        </span>
      </label>
      {open ? (
        <div className="seller-suggest" role="listbox">
          {loading ? <div className="seller-suggest-empty">กำลังค้น…</div> : null}
          {!loading && !draft.trim() ? (
            <div className="seller-suggest-empty">พิมพ์ชื่อ รหัส หรือเบอร์ แล้วเลือก 1 คน</div>
          ) : null}
          {!loading && draft.trim() && rows.length === 0 ? (
            <div className="seller-suggest-empty">ไม่พบลูกค้า — ต้องเลือกจากรายชื่อจึงจะกรอง</div>
          ) : null}
          {!loading
            ? rows.map((row, idx) => (
                <button
                  key={row.sellerId}
                  type="button"
                  role="option"
                  aria-selected={idx === active}
                  className={`seller-suggest-item ${idx === active ? "active" : ""}`}
                  onMouseEnter={() => setActive(idx)}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => pick(row)}
                >
                  <span className="seller-suggest-name">{sellerChoiceLabel(row)}</span>
                  {sellerChoiceMeta(row) ? <span className="seller-suggest-meta">{sellerChoiceMeta(row)}</span> : null}
                </button>
              ))
            : null}
          {!loading && rows.length > 1 ? (
            <div className="seller-suggest-empty">มีหลายคน — คลิกเลือก 1 รายการ ตารางจะไม่รวมยอด</div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

export function TradeSummaryApp() {
  const router = useRouter();
  const search = useSearchParams();
  const tab = ((search.get("tab") as PageTab) || "in") as PageTab;
  const metric = ((search.get("metric") as Metric) || "amount") as Metric;
  const yearParam = Number(search.get("year"));
  const beYear = Number.isFinite(yearParam) && yearParam >= 2500 ? yearParam : currentBuddhistYear();
  const branch = search.get("branch") || "";
  const itemGroup = search.get("item_group") || "";
  const sellerId = search.get("seller_id") || "";
  const sellerName = search.get("seller") || "";
  const buyerId = search.get("buyer_id") || "";
  const buyerName = search.get("buyer") || "";
  const q = search.get("q") || "";
  const customerGroup = search.get("group") || "";
  const reportKindRaw = search.get("kind");
  const reportKind: CustomerReportKind | "" =
    reportKindRaw === "new" ||
    reportKindRaw === "lost" ||
    reportKindRaw === "retained" ||
    reportKindRaw === "returned"
      ? reportKindRaw
      : "";
  const silentDays = search.get("silent_days") || "";
  const customerPage = Math.max(1, Number(search.get("page")) || 1);
  const monthRaw = Number(search.get("month"));
  const transformMonth =
    Number.isInteger(monthRaw) && monthRaw >= 1 && monthRaw <= 12
      ? monthRaw
      : defaultFocusMonth(fromBuddhistYear(beYear));
  const openSideRaw = search.get("open_side");
  const openSide: OpenSide = openSideRaw === "in" || openSideRaw === "out" ? openSideRaw : "all";
  const stockFrom = search.get("from") || `${currentCeYear()}-01-01`;
  const stockTo = search.get("to") || sqlDay(new Date());
  const capRaw = Number(search.get("cap"));
  const smallInCap: SmallInCap = (SMALL_IN_CAPS as readonly number[]).includes(capRaw)
    ? (capRaw as SmallInCap)
    : 10000;
  const smallInBranchKey = search.get("branches") || "";
  const smallInItemGroupKey = search.get("item_groups") || "";
  const smallInBranches = useMemo(() => parseListParam(smallInBranchKey), [smallInBranchKey]);
  const smallInItemGroups = useMemo(() => parseListParam(smallInItemGroupKey), [smallInItemGroupKey]);

  const setParams = useCallback(
    (patch: Record<string, string | null>) => {
      const next = new URLSearchParams(search.toString());
      for (const [k, v] of Object.entries(patch)) {
        if (v === null || v === "") next.delete(k);
        else next.set(k, v);
      }
      router.replace(`/?${next.toString()}`);
    },
    [router, search]
  );

  const [data, setData] = useState<TradeSummary | null>(null);
  const [lookup, setLookup] = useState<TicketLookupResult | null>(null);
  const [openTickets, setOpenTickets] = useState<OpenTicketsResult | null>(null);
  const [stock, setStock] = useState<StockResult | null>(null);
  const [customers, setCustomers] = useState<CustomersResult | null>(null);
  const [customerReport, setCustomerReport] = useState<CustomerReportResult | null>(null);
  const [customerPurchases, setCustomerPurchases] = useState<CustomerPurchasesResult | null>(null);
  const [customerSales, setCustomerSales] = useState<CustomerPurchasesResult | null>(null);
  const [smallIn, setSmallIn] = useState<SmallInResult | null>(null);
  const [salesProfit, setSalesProfit] = useState<SalesProfitResult | null>(null);
  const [transforms, setTransforms] = useState<StockTransformsResult | null>(null);
  const [lookupInput, setLookupInput] = useState(q);
  const [customerQuery, setCustomerQuery] = useState("");
  const [customerBuyQuery, setCustomerBuyQuery] = useState("");
  const [customerSellQuery, setCustomerSellQuery] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [dataEpoch, setDataEpoch] = useState(0);
  const [navOpen, setNavOpen] = useState(false);

  useEffect(() => {
    if (tab !== "customers") setLookupInput(q);
  }, [q, tab]);

  useEffect(() => {
    if (
      tab === "lookup" ||
      tab === "open" ||
      tab === "stock" ||
      tab === "customers" ||
      tab === "customer-report" ||
      tab === "customer-buy" ||
      tab === "customer-sell" ||
      tab === "small-in" ||
      tab === "sales-profit" ||
      tab === "transform"
    )
      return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    const qs = new URLSearchParams({ side: tab, year: String(fromBuddhistYear(beYear)) });
    if (branch) qs.set("branch_code", branch);
    if (itemGroup) qs.set("item_group", itemGroup);
    if (tab === "in" && sellerId) qs.set("seller_id", sellerId);
    if (tab === "out" && buyerId) qs.set("buyer_id", buyerId);
    fetchJson<TradeSummary>(`/api/kpis/trade-summary?${qs}`)
      .then((d) => {
        if (!cancelled) {
          setData(d);
          setCollapsed(new Set());
        }
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
  }, [tab, beYear, branch, itemGroup, sellerId, buyerId, dataEpoch]);

  useEffect(() => {
    if (tab !== "lookup") return;
    if (!q) {
      setLookup(null);
      setError(null);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetchJson<TicketLookupResult>(`/api/tickets/lookup?q=${encodeURIComponent(q)}`)
      .then((d) => {
        if (!cancelled) setLookup(d);
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
  }, [tab, q, dataEpoch]);

  useEffect(() => {
    if (tab !== "open") return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    const qs = new URLSearchParams();
    if (openSide !== "all") qs.set("side", openSide);
    if (branch) qs.set("branch_code", branch);
    if (itemGroup) qs.set("item_group", itemGroup);
    fetchJson<OpenTicketsResult>(`/api/tickets/open?${qs}`)
      .then((d) => {
        if (!cancelled) setOpenTickets(d);
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
  }, [tab, openSide, branch, itemGroup, dataEpoch]);

  useEffect(() => {
    if (tab !== "stock") return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    const qs = new URLSearchParams();
    if (branch) qs.set("branch_code", branch);
    if (itemGroup) qs.set("item_group", itemGroup);
    qs.set("from", stockFrom);
    qs.set("to", stockTo);
    fetchJson<StockResult>(`/api/kpis/stock?${qs}`)
      .then((d) => {
        if (!cancelled) {
          setStock(d);
          setCollapsed(new Set());
        }
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
  }, [tab, branch, itemGroup, stockFrom, stockTo, dataEpoch]);

  useEffect(() => {
    if (tab !== "customers") return;
    let cancelled = false;
    const handle = window.setTimeout(
      () => {
        setLoading(true);
        setError(null);
        const qs = new URLSearchParams({
          year: String(fromBuddhistYear(beYear)),
          page: String(customerPage),
        });
        if (customerGroup) qs.set("group", customerGroup);
        if (silentDays) qs.set("silent_days", silentDays);
        if (customerQuery.trim()) qs.set("q", customerQuery.trim());
        fetchJson<CustomersResult>(`/api/kpis/customers?${qs}`)
          .then((d) => {
            if (!cancelled) setCustomers(d);
          })
          .catch((e) => {
            if (!cancelled) setError(e instanceof Error ? e.message : String(e));
          })
          .finally(() => {
            if (!cancelled) setLoading(false);
          });
      },
      customerQuery.trim() ? 300 : 0
    );
    return () => {
      cancelled = true;
      window.clearTimeout(handle);
    };
  }, [tab, beYear, customerGroup, silentDays, customerQuery, customerPage, dataEpoch]);

  useEffect(() => {
    if (tab !== "customer-report") return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    const qs = new URLSearchParams({ year: String(fromBuddhistYear(beYear)) });
    if (customerGroup) qs.set("group", customerGroup);
    fetchJson<CustomerReportResult>(`/api/kpis/customer-report?${qs}`)
      .then((d) => {
        if (!cancelled) setCustomerReport(d);
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
  }, [tab, beYear, customerGroup, dataEpoch]);

  useEffect(() => {
    if (tab !== "customer-buy") return;
    let cancelled = false;
    const handle = window.setTimeout(
      () => {
        setLoading(true);
        setError(null);
        const qs = new URLSearchParams({
          year: String(fromBuddhistYear(beYear)),
          page: String(customerPage),
        });
        if (customerBuyQuery.trim()) qs.set("q", customerBuyQuery.trim());
        fetchJson<CustomerPurchasesResult>(`/api/kpis/customer-purchases?${qs}`)
          .then((d) => {
            if (!cancelled) setCustomerPurchases(d);
          })
          .catch((e) => {
            if (!cancelled) setError(e instanceof Error ? e.message : String(e));
          })
          .finally(() => {
            if (!cancelled) setLoading(false);
          });
      },
      customerBuyQuery.trim() ? 300 : 0
    );
    return () => {
      cancelled = true;
      window.clearTimeout(handle);
    };
  }, [tab, beYear, customerBuyQuery, customerPage, dataEpoch]);

  useEffect(() => {
    if (tab !== "customer-sell") return;
    let cancelled = false;
    const handle = window.setTimeout(
      () => {
        setLoading(true);
        setError(null);
        const qs = new URLSearchParams({
          year: String(fromBuddhistYear(beYear)),
          page: String(customerPage),
        });
        if (customerSellQuery.trim()) qs.set("q", customerSellQuery.trim());
        fetchJson<CustomerPurchasesResult>(`/api/kpis/customer-sales?${qs}`)
          .then((d) => {
            if (!cancelled) setCustomerSales(d);
          })
          .catch((e) => {
            if (!cancelled) setError(e instanceof Error ? e.message : String(e));
          })
          .finally(() => {
            if (!cancelled) setLoading(false);
          });
      },
      customerSellQuery.trim() ? 300 : 0
    );
    return () => {
      cancelled = true;
      window.clearTimeout(handle);
    };
  }, [tab, beYear, customerSellQuery, customerPage, dataEpoch]);

  useEffect(() => {
    if (tab !== "small-in") return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    const qs = new URLSearchParams({
      year: String(fromBuddhistYear(beYear)),
      cap: String(smallInCap),
    });
    if (smallInBranches.length) qs.set("branches", smallInBranches.join(","));
    if (smallInItemGroups.length) qs.set("item_groups", smallInItemGroups.join(","));
    fetchJson<SmallInResult>(`/api/kpis/small-in?${qs}`)
      .then((d) => {
        if (!cancelled) setSmallIn(d);
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
  }, [tab, beYear, smallInCap, smallInBranches, smallInItemGroups, dataEpoch]);

  useEffect(() => {
    if (tab !== "sales-profit") return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    const qs = new URLSearchParams({
      year: String(fromBuddhistYear(beYear)),
      page: String(customerPage),
    });
    if (branch) qs.set("branch_code", branch);
    if (itemGroup) qs.set("item_group", itemGroup);
    if (buyerId) qs.set("buyer_id", buyerId);
    fetchJson<SalesProfitResult>(`/api/kpis/sales-profit?${qs}`)
      .then((d) => {
        if (!cancelled) setSalesProfit(d);
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
  }, [tab, beYear, branch, itemGroup, buyerId, customerPage, dataEpoch]);

  useEffect(() => {
    if (tab !== "transform") return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    const qs = new URLSearchParams({
      year: String(fromBuddhistYear(beYear)),
      month: String(transformMonth),
    });
    if (branch) qs.set("branch_code", branch);
    if (itemGroup) qs.set("item_group", itemGroup);
    fetchJson<StockTransformsResult>(`/api/kpis/transforms?${qs}`)
      .then((d) => {
        if (!cancelled) {
          setTransforms(d);
          setCollapsed(new Set());
        }
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
  }, [tab, beYear, transformMonth, branch, itemGroup, dataEpoch]);

  const theme = TAB_META[tab]?.theme ?? "theme-in";
  const currentTab = TAB_META[tab] ?? TAB_META.in;
  const years =
    tab === "customers" && customers?.availableBeYears?.length
      ? customers.availableBeYears
      : tab === "customer-report" && customerReport?.availableBeYears?.length
        ? customerReport.availableBeYears
      : tab === "customer-buy" && customerPurchases?.availableBeYears?.length
        ? customerPurchases.availableBeYears
        : tab === "customer-sell" && customerSales?.availableBeYears?.length
          ? customerSales.availableBeYears
          : tab === "small-in" && smallIn?.availableBeYears?.length
            ? smallIn.availableBeYears
            : tab === "sales-profit" && salesProfit?.availableBeYears?.length
              ? salesProfit.availableBeYears
              : tab === "transform" && transforms?.availableBeYears?.length
                ? transforms.availableBeYears
            : data?.availableBeYears?.length
              ? data.availableBeYears
              : [beYear];
  const chartColor =
    tab === "in" ? "#1d4f91" : tab === "out" ? "#1f6b3a" : tab === "profit" || tab === "sales-profit" ? "#c5a028" : "#1f4d3a";

  const monthlyChart = useMemo(
    () =>
      (data?.monthly ?? []).map((row) => ({
        label: THAI_MONTHS_SHORT[row.month - 1],
        value: metricValue(row, metric),
      })),
    [data, metric]
  );

  const dailyChart = useMemo(
    () =>
      (data?.daily ?? []).map((row) => ({
        label: row.day.slice(5),
        value: metricValue(row, metric),
      })),
    [data, metric]
  );

  const pivotMonths = metric === "weight" ? "weightKgMonths" : "amountMonths";
  const pivotTotal = metric === "weight" ? "weightKgTotal" : "amountTotal";

  const grand = useMemo(() => {
    const months = Array.from({ length: 12 }, () => 0);
    let total = 0;
    for (const row of data?.pivot ?? []) {
      row[pivotMonths].forEach((n, i) => {
        months[i] += n;
      });
      total += row[pivotTotal];
    }
    return { months, total };
  }, [data, pivotMonths, pivotTotal]);

  return (
    <div className={`trade-shell ${theme}`}>
      {navOpen ? (
        <button
          type="button"
          className="trade-nav-backdrop"
          aria-label="ปิดเมนู"
          onClick={() => setNavOpen(false)}
        />
      ) : null}
      <aside id="trade-sidebar" className={`trade-sidebar ${navOpen ? "open" : ""}`}>
        {NAV_GROUPS.map((group) => (
          <div key={group.title} className="trade-nav-group">
            <h2>{group.title}</h2>
            {group.tabs.map((id) => (
              <button
                key={id}
                type="button"
                className={`trade-nav-item ${tab === id ? "active" : ""}`}
                onClick={() => {
                  setParams({ tab: id, page: null });
                  setNavOpen(false);
                }}
              >
                {TAB_META[id].label}
              </button>
            ))}
          </div>
        ))}
      </aside>
      <div className="trade-content">
      <nav className="trade-navbar">
        <div className="trade-navbar-left">
          <button
            type="button"
            className="trade-nav-toggle"
            aria-expanded={navOpen}
            aria-controls="trade-sidebar"
            onClick={() => setNavOpen((open) => !open)}
          >
            เมนู
          </button>
          <h1 className="trade-brand">Dashboard Scrapee</h1>
        </div>
        <SessionBar onSynced={() => setDataEpoch((n) => n + 1)} />
      </nav>
        <div className="trade-main">
      <header className="header trade-filters">
        <div className="trade-page-heading">
          <h2 className="trade-page-title">{currentTab.label}</h2>
          <PageHelpButton tab={tab} title={currentTab.label} />
        </div>
        {tab === "lookup" ? (
          <form
            className="row trade-toolbar"
            onSubmit={(e) => {
              e.preventDefault();
              setParams({ q: lookupInput.trim() || null });
            }}
          >
            <label className="muted">
              เลขที่ตั๋ว{" "}
              <input
                type="text"
                inputMode="numeric"
                placeholder="เช่น 71572"
                value={lookupInput}
                onChange={(e) => setLookupInput(e.target.value)}
              />
            </label>
            <button className="pill active" type="submit">
              ค้นหา
            </button>
            <ExportExcelButton tab="lookup" disabled={loading || !lookupInput.trim()} extra={{ q: lookupInput.trim() }} />
          </form>
        ) : tab === "customer-buy" || tab === "customer-sell" ? (
          <div className="row trade-toolbar">
            <label className="muted">
              เลือกปี พ.ศ.{" "}
              <select value={beYear} onChange={(e) => setParams({ year: e.target.value, page: null })}>
                {[beYear, ...years.filter((y) => y !== beYear)].sort((a, b) => b - a).map((y) => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))}
              </select>
            </label>
            <label className="muted">
              ค้นชื่อ{" "}
              <input
                type="text"
                placeholder="ชื่อ รหัส เบอร์ หรือกลุ่ม"
                value={tab === "customer-sell" ? customerSellQuery : customerBuyQuery}
                onChange={(e) => {
                  if (tab === "customer-sell") setCustomerSellQuery(e.target.value);
                  else setCustomerBuyQuery(e.target.value);
                  setParams({ page: null });
                }}
              />
            </label>
            <div className="metric-toggle">
              <button
                className={`pill ${metric === "amount" ? "active" : ""}`}
                onClick={() => setParams({ metric: "amount" })}
              >
                ราคา / บาท
              </button>
              <button
                className={`pill ${metric === "weight" ? "active" : ""}`}
                onClick={() => setParams({ metric: "weight" })}
              >
                น้ำหนัก / กก.
              </button>
            </div>
            <ExportExcelButton
              tab={tab}
              disabled={loading}
              extra={{ q: tab === "customer-sell" ? customerSellQuery.trim() : customerBuyQuery.trim() }}
            />
          </div>
        ) : tab === "small-in" ? (
          <div className="row trade-toolbar">
            <label className="muted">
              เลือกปี พ.ศ.{" "}
              <select value={beYear} onChange={(e) => setParams({ year: e.target.value })}>
                {[beYear, ...years.filter((y) => y !== beYear)].sort((a, b) => b - a).map((y) => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))}
              </select>
            </label>
            <div className="metric-toggle">
              {SMALL_IN_CAPS.map((cap) => (
                <button
                  key={cap}
                  className={`pill ${smallInCap === cap ? "active" : ""}`}
                  onClick={() => setParams({ cap: String(cap) })}
                >
                  น้อยกว่า {formatNumber(cap, 0)}
                </button>
              ))}
            </div>
            <MultiCheckFilter
              label="สาขา"
              allLabel="ทุกสาขา"
              options={uniqueCodes(smallIn?.filterBranches, smallInBranches)}
              selected={smallInBranches}
              onChange={(next) => setParams({ branches: next.length ? next.join(",") : null })}
            />
            <MultiCheckFilter
              label="หมวดหมู่สินค้า"
              allLabel="ทุกหมวด"
              options={uniqueCodes(smallIn?.filterItemGroups, smallInItemGroups)}
              selected={smallInItemGroups}
              onChange={(next) => setParams({ item_groups: next.length ? next.join(",") : null })}
            />
            <ExportExcelButton tab="small-in" disabled={loading} />
          </div>
        ) : tab === "sales-profit" ? (
          <div className="row trade-toolbar">
            <label className="muted">
              เลือกปี พ.ศ.{" "}
              <select value={beYear} onChange={(e) => setParams({ year: e.target.value, page: null })}>
                {[beYear, ...years.filter((y) => y !== beYear)].sort((a, b) => b - a).map((y) => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))}
              </select>
            </label>
            <label className="muted">
              สาขา{" "}
              <select value={branch} onChange={(e) => setParams({ branch: e.target.value || null, page: null })}>
                <option value="">ทุกสาขา</option>
                {uniqueCodes(salesProfit?.branches, branch).map((code) => (
                  <option key={code} value={code}>
                    {code}
                  </option>
                ))}
              </select>
            </label>
            <label className="muted">
              รหัสสินค้า{" "}
              <select value={itemGroup} onChange={(e) => setParams({ item_group: e.target.value || null, page: null })}>
                <option value="">ทุกหมวด</option>
                {uniqueCodes(salesProfit?.itemGroups, itemGroup).map((code) => (
                  <option key={code} value={code}>
                    {code}
                  </option>
                ))}
              </select>
            </label>
            <SellerPicker
              key="sales-profit-buyer"
              sellerId={buyerId}
              sellerName={buyerName}
              endpoint="/api/kpis/buyers-search"
              onSelect={(choice) => {
                const label = choice ? choice.name?.trim() || choice.code || choice.sellerId : null;
                setParams({
                  buyer_id: choice?.sellerId ?? null,
                  buyer: label,
                  seller_id: null,
                  seller: null,
                  page: null,
                });
              }}
            />
            <ExportExcelButton tab="sales-profit" disabled={loading} />
          </div>
        ) : tab === "transform" ? (
          <div className="row trade-toolbar">
            <label className="muted">
              เลือกปี พ.ศ.{" "}
              <select
                value={beYear}
                onChange={(e) => {
                  const nextBe = Number(e.target.value);
                  setParams({
                    year: e.target.value,
                    month: String(defaultFocusMonth(fromBuddhistYear(nextBe))),
                    page: null,
                  });
                }}
              >
                {[beYear, ...years.filter((y) => y !== beYear)].sort((a, b) => b - a).map((y) => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))}
              </select>
            </label>
            <div className="metric-toggle">
              <button
                type="button"
                className="pill"
                onClick={() => {
                  const next = shiftFocusMonth(fromBuddhistYear(beYear), transformMonth, -1);
                  setParams({ year: String(toBuddhistYear(next.ceYear)), month: String(next.month), page: null });
                }}
              >
                เดือนก่อน
              </button>
              <span className="pill active">
                {THAI_MONTHS_SHORT[transformMonth - 1]} {beYear}
              </span>
              <button
                type="button"
                className="pill"
                onClick={() => {
                  const next = shiftFocusMonth(fromBuddhistYear(beYear), transformMonth, 1);
                  setParams({ year: String(toBuddhistYear(next.ceYear)), month: String(next.month), page: null });
                }}
              >
                เดือนถัดไป
              </button>
            </div>
            <label className="muted">
              สาขา{" "}
              <select value={branch} onChange={(e) => setParams({ branch: e.target.value || null, page: null })}>
                <option value="">ทุกสาขา</option>
                {uniqueCodes(transforms?.branches, branch).map((code) => (
                  <option key={code} value={code}>
                    {code}
                  </option>
                ))}
              </select>
            </label>
            <label className="muted">
              รหัสสินค้า{" "}
              <select value={itemGroup} onChange={(e) => setParams({ item_group: e.target.value || null, page: null })}>
                <option value="">ทุกหมวด</option>
                {uniqueCodes(transforms?.itemGroups, itemGroup).map((code) => (
                  <option key={code} value={code}>
                    {code}
                  </option>
                ))}
              </select>
            </label>
            <ExportExcelButton tab="transform" disabled={loading} extra={{ month: String(transformMonth) }} />
          </div>
        ) : tab === "customer-report" ? (
          <div className="row trade-toolbar">
            <label className="muted">
              เลือกปี พ.ศ.{" "}
              <select value={beYear} onChange={(e) => setParams({ year: e.target.value })}>
                {[beYear, ...years.filter((y) => y !== beYear)].sort((a, b) => b - a).map((y) => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))}
              </select>
            </label>
            <label className="muted">
              กลุ่ม{" "}
              <select value={customerGroup} onChange={(e) => setParams({ group: e.target.value || null })}>
                <option value="">ทุกกลุ่ม</option>
                {uniqueCodes(customerReport?.groups, customerGroup).map((code) => (
                  <option key={code} value={code}>
                    {code}
                  </option>
                ))}
              </select>
            </label>
            <ExportExcelButton tab="customer-report" disabled={loading} />
          </div>
        ) : tab === "customers" ? (
          <div className="row trade-toolbar">
            <label className="muted">
              เลือกปี พ.ศ.{" "}
              <select value={beYear} onChange={(e) => setParams({ year: e.target.value, page: null })}>
                {[beYear, ...years.filter((y) => y !== beYear)].sort((a, b) => b - a).map((y) => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))}
              </select>
            </label>
            <label className="muted">
              กลุ่ม{" "}
              <select value={customerGroup} onChange={(e) => setParams({ group: e.target.value || null, page: null })}>
                <option value="">ทุกกลุ่ม</option>
                {uniqueCodes(customers?.groups, customerGroup).map((code) => (
                  <option key={code} value={code}>
                    {code}
                  </option>
                ))}
              </select>
            </label>
            <label className="muted">
              ค้นชื่อ{" "}
              <input
                type="text"
                placeholder="ชื่อ รหัส หรือเบอร์"
                value={customerQuery}
                onChange={(e) => {
                  setCustomerQuery(e.target.value);
                  setParams({ page: null });
                }}
              />
            </label>
            <label className="muted">
              หายเกิน{" "}
              <select value={silentDays} onChange={(e) => setParams({ silent_days: e.target.value || null, page: null })}>
                <option value="">ทั้งหมด</option>
                <option value="30">30 วัน</option>
                <option value="60">60 วัน</option>
                <option value="90">90 วัน</option>
                <option value="180">180 วัน</option>
                <option value="365">365 วัน</option>
                <option value="never">—</option>
              </select>
            </label>
            <ExportExcelButton tab="customers" disabled={loading} extra={{ q: customerQuery.trim() }} />
          </div>
        ) : tab === "open" || tab === "stock" ? (
          <div className="row trade-toolbar">
            {tab === "open" ? (
              <label className="muted">
                ประเภท{" "}
                <select value={openSide} onChange={(e) => setParams({ open_side: e.target.value === "all" ? null : e.target.value })}>
                  <option value="all">ซื้อและขาย</option>
                  <option value="in">ซื้อเข้า</option>
                  <option value="out">ขายออก</option>
                </select>
              </label>
            ) : null}
            <label className="muted">
              สาขา{" "}
              <select value={branch} onChange={(e) => setParams({ branch: e.target.value || null })}>
                <option value="">ทุกสาขา</option>
                {uniqueCodes(tab === "stock" ? stock?.branches : openTickets?.branches, branch).map((code) => (
                  <option key={code} value={code}>
                    {code}
                  </option>
                ))}
              </select>
            </label>
            <label className="muted">
              รหัสสินค้า{" "}
              <select value={itemGroup} onChange={(e) => setParams({ item_group: e.target.value || null })}>
                <option value="">ทุกหมวด</option>
                {uniqueCodes(tab === "stock" ? stock?.itemGroups : openTickets?.itemGroups, itemGroup).map((code) => (
                  <option key={code} value={code}>
                    {code}
                  </option>
                ))}
              </select>
            </label>
            {tab === "stock" ? (
              <>
                <label className="muted">
                  วันที่เริ่มต้น{" "}
                  <input type="date" value={stockFrom} onChange={(e) => setParams({ from: e.target.value || null })} />
                </label>
                <label className="muted">
                  วันที่สิ้นสุด{" "}
                  <input type="date" value={stockTo} onChange={(e) => setParams({ to: e.target.value || null })} />
                </label>
              </>
            ) : null}
            <ExportExcelButton tab={tab} disabled={loading} />
          </div>
        ) : (
          <div className="row trade-toolbar">
            <label className="muted">
              เลือกปี พ.ศ.{" "}
              <select value={beYear} onChange={(e) => setParams({ year: e.target.value })}>
                {[beYear, ...years.filter((y) => y !== beYear)].sort((a, b) => b - a).map((y) => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))}
              </select>
            </label>
            <label className="muted">
              สาขา{" "}
              <select
                value={branch}
                onChange={(e) => setParams({ branch: e.target.value || null })}
              >
                <option value="">ทุกสาขา</option>
                {uniqueCodes(data?.branches, branch).map((code) => (
                  <option key={code} value={code}>
                    {code}
                  </option>
                ))}
              </select>
            </label>
            <label className="muted">
              รหัสสินค้า{" "}
              <select
                value={itemGroup}
                onChange={(e) => setParams({ item_group: e.target.value || null })}
              >
                <option value="">ทุกหมวด</option>
                {uniqueCodes(data?.itemGroups, itemGroup).map((code) => (
                  <option key={code} value={code}>
                    {code}
                  </option>
                ))}
              </select>
            </label>
            {tab === "in" || tab === "out" ? (
              <SellerPicker
                key={tab}
                sellerId={tab === "out" ? buyerId : sellerId}
                sellerName={tab === "out" ? buyerName : sellerName}
                endpoint={tab === "out" ? "/api/kpis/buyers-search" : "/api/kpis/sellers-search"}
                onSelect={(choice) => {
                  const label = choice ? choice.name?.trim() || choice.code || choice.sellerId : null;
                  if (tab === "out") {
                    setParams({
                      buyer_id: choice?.sellerId ?? null,
                      buyer: label,
                      seller_id: null,
                      seller: null,
                    });
                    return;
                  }
                  setParams({
                    seller_id: choice?.sellerId ?? null,
                    seller: label,
                    buyer_id: null,
                    buyer: null,
                  });
                }}
              />
            ) : null}
            <div className="metric-toggle">
              <button
                className={`pill ${metric === "amount" ? "active" : ""}`}
                onClick={() => setParams({ metric: "amount" })}
              >
                ราคา / บาท
              </button>
              <button
                className={`pill ${metric === "weight" ? "active" : ""}`}
                onClick={() => setParams({ metric: "weight" })}
              >
                น้ำหนัก / กก.
              </button>
            </div>
            <ExportExcelButton tab={tab} disabled={loading} />
          </div>
        )}
      </header>

      {error ? <p className="error">{error}</p> : null}
      {tab === "lookup" && loading ? <p className="muted">กำลังค้นหาเลขที่ {q}…</p> : null}
      {tab === "open" && loading && !openTickets ? <p className="muted">กำลังโหลดตั๋วที่ยังไม่ปิด…</p> : null}
      {tab === "stock" && loading && !stock ? <p className="muted">กำลังโหลดสต็อก…</p> : null}
      {tab === "customers" && loading && !customers ? <p className="muted">กำลังโหลดลูกค้าปี {beYear}…</p> : null}
      {tab === "customer-report" && loading && !customerReport ? <p className="muted">กำลังโหลดรายงานลูกค้าปี {beYear}…</p> : null}
      {tab === "customer-buy" && loading && !customerPurchases ? <p className="muted">กำลังโหลดซื้อเข้ารายลูกค้าปี {beYear}…</p> : null}
      {tab === "customer-sell" && loading && !customerSales ? <p className="muted">กำลังโหลดขายออกรายลูกค้าปี {beYear}…</p> : null}
      {tab === "small-in" && loading && !smallIn ? <p className="muted">กำลังโหลดยอดซื้อต่ำกว่าเกณฑ์ปี {beYear}…</p> : null}
      {tab === "sales-profit" && loading && !salesProfit ? <p className="muted">กำลังโหลดกำไรจากการขายปี {beYear}…</p> : null}
      {tab === "transform" && loading && !transforms ? (
        <p className="muted">
          กำลังโหลดแปรสภาพ {THAI_MONTHS_SHORT[transformMonth - 1]} {beYear}…
        </p>
      ) : null}
      {isTradeSide(tab) && loading && !data ? <p className="muted">กำลังโหลดข้อมูลปี {beYear}…</p> : null}

      {tab === "lookup" ? (
        <LookupPanel query={q} result={lookup} />
      ) : null}

      {tab === "open" && openTickets ? (
        <OpenTicketsPanel data={openTickets} />
      ) : null}

      {tab === "stock" && stock ? (
        <StockPanel
          data={stock}
          collapsed={collapsed}
          onToggle={(key) => {
            setCollapsed((prev) => {
              const next = new Set(prev);
              if (next.has(key)) next.delete(key);
              else next.add(key);
              return next;
            });
          }}
        />
      ) : null}

      {tab === "customers" && customers ? (
        <CustomersPanel
          data={customers}
          silentDays={silentDays}
          onSilentDays={(value) => setParams({ silent_days: value, page: null })}
          onPage={(page) => setParams({ page: page <= 1 ? null : String(page) })}
        />
      ) : null}

      {tab === "customer-report" && customerReport ? (
        <CustomerReportPanel
          data={customerReport}
          kind={reportKind}
          onSelectKind={(next) => setParams({ kind: next || null })}
        />
      ) : null}

      {tab === "customer-buy" && customerPurchases ? (
        <CustomerMonthPanel
          data={customerPurchases}
          metric={metric}
          countLabel="ลูกค้าที่มีซื้อ"
          title="สรุปซื้อเข้ารายลูกค้า"
          onPage={(page) => setParams({ page: page <= 1 ? null : String(page) })}
        />
      ) : null}

      {tab === "customer-sell" && customerSales ? (
        <CustomerMonthPanel
          data={customerSales}
          metric={metric}
          countLabel="ลูกค้าที่มีขาย"
          title="สรุปขายออกรายลูกค้า"
          onPage={(page) => setParams({ page: page <= 1 ? null : String(page) })}
        />
      ) : null}

      {tab === "small-in" && smallIn ? <SmallInPanel data={smallIn} /> : null}

      {tab === "sales-profit" && salesProfit ? (
        <SalesProfitPanel
          data={salesProfit}
          onPage={(page) => setParams({ page: page <= 1 ? null : String(page) })}
        />
      ) : null}

      {tab === "transform" && transforms ? (
        <TransformPanel
          data={transforms}
          collapsed={collapsed}
          onToggle={(key) => {
            setCollapsed((prev) => {
              const next = new Set(prev);
              if (next.has(key)) next.delete(key);
              else next.add(key);
              return next;
            });
          }}
          onSelectMonth={(month) => setParams({ month: String(month), page: null })}
        />
      ) : null}

      {isTradeSide(tab) && data ? (
        <>
          <KpiStrip data={data} metric={metric} tab={isTradeSide(tab) ? tab : "in"} />
          <div className="chart-grid">
            <div className="card panel chart-card">
              <div className="label">{chartTitle(isTradeSide(tab) ? tab : "in", metric, "เดือน")}</div>
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={monthlyChart}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#d9d2c5" />
                  <XAxis dataKey="label" tick={{ fontSize: 12 }} />
                  <YAxis width={64} tick={{ fontSize: 11 }} tickFormatter={(v) => formatAxis(Number(v), metric)} />
                  <Tooltip formatter={(v) => formatMetric(Number(v), metric)} />
                  <Bar dataKey="value" fill={chartColor} radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div className="card panel chart-card">
              <div className="label">{chartTitle(isTradeSide(tab) ? tab : "in", metric, "วัน")}</div>
              <ResponsiveContainer width="100%" height={260}>
                <LineChart data={dailyChart}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#d9d2c5" />
                  <XAxis dataKey="label" tick={{ fontSize: 11 }} interval="preserveStartEnd" minTickGap={24} />
                  <YAxis width={64} tick={{ fontSize: 11 }} tickFormatter={(v) => formatAxis(Number(v), metric)} />
                  <Tooltip formatter={(v) => formatMetric(Number(v), metric)} labelFormatter={(l) => `วันที่ ${l}`} />
                  <Line type="monotone" dataKey="value" stroke={chartColor} strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="panel">
            <h2>
              สรุปรายเดือนตามสาขาและรหัสสินค้า · ปี {data.beYear} ·{" "}
              {metric === "weight" ? "กิโลกรัม" : "บาท"}
            </h2>
            <div className="pivot-wrap">
              <BranchItemPivot
                data={data}
                metric={metric}
                side={tab === "out" ? "out" : "in"}
                pageBranch={branch}
                pageItemGroup={itemGroup}
                sellerId={tab === "in" ? sellerId : ""}
                sellerName={tab === "in" ? sellerName : ""}
                buyerId={tab === "out" ? buyerId : ""}
                buyerName={tab === "out" ? buyerName : ""}
                pivotMonths={pivotMonths}
                pivotTotal={pivotTotal}
                grand={grand}
                disableLinks={tab === "profit"}
                collapsed={collapsed}
                onToggle={(key) => {
                  setCollapsed((prev) => {
                    const next = new Set(prev);
                    if (next.has(key)) next.delete(key);
                    else next.add(key);
                    return next;
                  });
                }}
              />
            </div>
          </div>
        </>
      ) : null}
        </div>
      </div>
    </div>
  );
}

function formatCustomerDay(value: string | null): string {
  if (!value) return "ยังไม่เคยมา";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "ยังไม่เคยมา";
  return new Intl.DateTimeFormat("th-TH", {
    timeZone: "Asia/Bangkok",
    dateStyle: "medium",
  }).format(d);
}

type CustomerSortKey = "name" | "group" | "tel" | "code" | "lastPaidAt" | "silentDays" | "tickets" | "weightKg" | "amount";

function customerSortValue(row: CustomerRow, key: CustomerSortKey): string | number | null {
  if (key === "name") return row.name;
  if (key === "group") return row.group;
  if (key === "tel") return row.tel;
  if (key === "code") return row.code;
  if (key === "lastPaidAt") return row.lastPaidAt;
  if (key === "silentDays") return row.neverSold ? Number.POSITIVE_INFINITY : (row.silentDays ?? 0);
  if (key === "tickets") return row.tickets;
  if (key === "weightKg") return row.weightKg;
  return row.amount;
}

function compareCustomers(a: CustomerRow, b: CustomerRow, key: CustomerSortKey, dir: "asc" | "desc"): number {
  const av = customerSortValue(a, key);
  const bv = customerSortValue(b, key);
  const mul = dir === "asc" ? 1 : -1;
  if (av == null && bv == null) return 0;
  if (av == null) return 1;
  if (bv == null) return -1;
  if (typeof av === "number" && typeof bv === "number") return (av - bv) * mul;
  return String(av).localeCompare(String(bv), "th", { numeric: true }) * mul;
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
  sortKey: CustomerSortKey;
  current: CustomerSortKey;
  dir: "asc" | "desc";
  onSort: (key: CustomerSortKey) => void;
  className?: string;
}) {
  const active = current === sortKey;
  return (
    <th
      className={`sortable ${className ?? ""}`.trim()}
      aria-sort={active ? (dir === "asc" ? "ascending" : "descending") : "none"}
      onClick={() => onSort(sortKey)}
    >
      <button type="button" className="sort-th">
        {label}
        <span className="sort-mark">{active ? (dir === "asc" ? " ▲" : " ▼") : " ↕"}</span>
      </button>
    </th>
  );
}

function formatReportMonth(iso: string): string {
  const [y, m] = iso.split("-").map(Number);
  if (!y || !m) return iso;
  return `1 ${THAI_MONTHS_SHORT[m - 1]} ${toBuddhistYear(y)}`;
}

function formatReportAxis(iso: string): string {
  const [y, m] = iso.split("-").map(Number);
  if (!y || !m) return iso;
  return `${m}/${toBuddhistYear(y)}`;
}

function ReportDelta({ kpi, unit }: { kpi: CustomerReportKpi; unit: string }) {
  if (kpi.changePct == null) {
    return <div className="hint">เทียบเดือนก่อน {formatNumber(kpi.previous, 0)} {unit}</div>;
  }
  const up = kpi.changePct >= 0;
  return (
    <div className={`hint report-delta ${up ? "up" : "down"}`}>
      {up ? "↑" : "↓"} {formatNumber(Math.abs(kpi.changePct), 2)}% vs. เดือนก่อน: {formatNumber(kpi.previous, 0)} {unit}
    </div>
  );
}

const REPORT_KIND_META: Record<CustomerReportKind, { label: string; amountLabel: string }> = {
  new: { label: "ลูกค้าใหม่เดือนนี้", amountLabel: "ยอดเดือนนี้" },
  lost: { label: "ลูกค้าที่หายเดือนนี้", amountLabel: "ยอดเดือนก่อน" },
  retained: { label: "ลูกค้าเดิมที่ยังอยู่ในเดือนนี้", amountLabel: "ยอดเดือนนี้" },
  returned: { label: "ลูกค้ากลับมาเดือนนี้", amountLabel: "ยอดเดือนนี้" },
};

function CustomerReportPanel({
  data,
  kind,
  onSelectKind,
}: {
  data: CustomerReportResult;
  kind: CustomerReportKind | "";
  onSelectKind: (next: CustomerReportKind | "") => void;
}) {
  const chart = data.series.map((row) => ({
    label: formatReportAxis(row.month),
    newCount: row.newCount,
    returningCount: row.returningCount,
  }));
  const lists = data.lists ?? { new: [], lost: [], retained: [], returned: [] };
  const rows: CustomerReportPerson[] = kind ? lists[kind] : [];
  const meta = kind ? REPORT_KIND_META[kind] : null;

  function toggle(next: CustomerReportKind) {
    onSelectKind(kind === next ? "" : next);
  }

  return (
    <div>
      <div className="customer-report-kpis">
        <button type="button" className={`card kpi-card report-kpi ${kind === "new" ? "active" : ""}`} onClick={() => toggle("new")}>
          <div className="label">ลูกค้าใหม่เดือนนี้ (คน)</div>
          <div className="value">{formatNumber(data.newCustomers.current, 0)}</div>
          <div className="hint">{formatReportMonth(data.monthStart)}</div>
          <ReportDelta kpi={data.newCustomers} unit="คน" />
        </button>
        <button type="button" className={`card kpi-card report-kpi ${kind === "lost" ? "active" : ""}`} onClick={() => toggle("lost")}>
          <div className="label">ลูกค้าที่หายเดือนนี้ (คน)</div>
          <div className="value">{formatNumber(data.lostCustomers.current, 0)}</div>
          <div className="hint">{formatReportMonth(data.monthStart)}</div>
          <ReportDelta kpi={data.lostCustomers} unit="คน" />
        </button>
        <button type="button" className={`card kpi-card report-kpi ${kind === "retained" ? "active" : ""}`} onClick={() => toggle("retained")}>
          <div className="label">ลูกค้าเดิมที่ยังอยู่ในเดือนนี้ (คน)</div>
          <div className="value">{formatNumber(data.retainedCustomers.current, 0)}</div>
          <div className="hint">{formatReportMonth(data.monthStart)}</div>
          <ReportDelta kpi={data.retainedCustomers} unit="คน" />
        </button>
        <button type="button" className={`card kpi-card report-kpi ${kind === "returned" ? "active" : ""}`} onClick={() => toggle("returned")}>
          <div className="label">ลูกค้ากลับมาเดือนนี้ (คน)</div>
          <div className="value">{formatNumber(data.returnedCustomers.current, 0)}</div>
          <div className="hint">{formatReportMonth(data.monthStart)}</div>
          <ReportDelta kpi={data.returnedCustomers} unit="คน" />
        </button>
      </div>
      <div className="card panel chart-card customer-report-chart">
        <div className="label">ลูกค้าใหม่ vs กลับมา</div>
        <ResponsiveContainer width="100%" height={320}>
          <LineChart data={chart} margin={{ top: 8, right: 16, left: 4, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#d9d2c5" />
            <XAxis dataKey="label" tick={{ fontSize: 11 }} />
            <YAxis width={48} tick={{ fontSize: 11 }} tickFormatter={(v) => formatNumber(Number(v), 0)} />
            <Tooltip formatter={(v) => formatNumber(Number(v), 0)} />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            <Line type="monotone" dataKey="newCount" name="ลูกค้าใหม่" stroke="#c4a3d8" strokeWidth={2} dot={{ r: 3 }} />
            <Line type="monotone" dataKey="returningCount" name="ลูกค้ากลับมา" stroke="#5a8fd4" strokeWidth={2} dot={{ r: 3 }} />
          </LineChart>
        </ResponsiveContainer>
      </div>
      {meta ? (
        <div className="panel">
          <h2>
            {meta.label} · {formatNumber(rows.length, 0)} คน
          </h2>
          {rows.length === 0 ? (
            <p className="muted">ไม่มีลูกค้าในกลุ่มนี้</p>
          ) : (
            <div className="pivot-wrap customers-wrap">
              <table className="pivot">
                <thead>
                  <tr>
                    <th>ชื่อ</th>
                    <th>กลุ่ม</th>
                    <th>เบอร์โทร</th>
                    <th>รหัส</th>
                    <th>มาล่าสุด</th>
                    <th className="right">{kind === "lost" ? "ใบเดือนก่อน" : "ใบเดือนนี้"}</th>
                    <th className="right">{meta.amountLabel}</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.sellerId}>
                      <td>{row.name ?? "—"}</td>
                      <td>{row.group}</td>
                      <td>{row.tel ?? "—"}</td>
                      <td>{row.code ?? "—"}</td>
                      <td>{formatCustomerDay(row.lastPaidAt)}</td>
                      <td className="right">{formatNumber(row.tickets, 0)}</td>
                      <td className="right">{formatMoney(row.amount)}</td>
                    </tr>
                  ))}
                  <tr className="pivot-total">
                    <td>รวม {formatNumber(rows.length, 0)} คน</td>
                    <td></td>
                    <td></td>
                    <td></td>
                    <td></td>
                    <td className="right">{formatNumber(rows.reduce((sum, row) => sum + row.tickets, 0), 0)}</td>
                    <td className="right">{formatMoney(rows.reduce((sum, row) => sum + row.amount, 0))}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}

const CUSTOMER_KPI_TONES = {
  mint: { spark: [6, 8, 7, 10, 12, 16] },
  violet: { spark: [10, 8, 11, 7, 12, 15] },
  orange: { spark: [14, 10, 6, 9, 8, 12] },
  gold: { spark: [8, 11, 9, 13, 10, 14] },
  amber: { spark: [16, 13, 11, 8, 7, 6] },
  rose: { spark: [12, 9, 11, 7, 8, 10] },
  sky: { spark: [7, 9, 8, 12, 10, 15] },
} as const;

type CustomerKpiTone = keyof typeof CUSTOMER_KPI_TONES;

const SILENT_KPI_TONES: Record<(typeof CUSTOMER_SILENT_BUCKETS)[number], CustomerKpiTone> = {
  30: "violet",
  60: "orange",
  90: "gold",
  180: "amber",
  365: "rose",
};

function customerShareHint(count: number, total: number) {
  if (total <= 0) return "ของช่วงตัวกรอง";
  return `${((count / total) * 100).toFixed(1)}% ของช่วงตัวกรอง`;
}

function CustomerKpiIcon({ name }: { name: "db" | "calendar" | "file" | "user" }) {
  const stroke = { fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  if (name === "db") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden {...stroke}>
        <ellipse cx="12" cy="6" rx="7" ry="2.6" />
        <path d="M5 6v5.2c0 1.5 3.1 2.6 7 2.6s7-1.1 7-2.6V6" />
        <path d="M5 11.2V16.6c0 1.5 3.1 2.6 7 2.6s7-1.1 7-2.6v-5.4" />
      </svg>
    );
  }
  if (name === "file") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden {...stroke}>
        <path d="M8 4.5h6.2L18.5 9v10.5H8A1.5 1.5 0 0 1 6.5 18V6A1.5 1.5 0 0 1 8 4.5Z" />
        <path d="M14 4.5V9h4.5" />
      </svg>
    );
  }
  if (name === "user") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden {...stroke}>
        <circle cx="12" cy="9" r="3.2" />
        <path d="M6.2 18.5c.8-2.6 3-4 5.8-4s5 1.4 5.8 4" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" aria-hidden {...stroke}>
      <rect x="5" y="6" width="14" height="13" rx="2" />
      <path d="M5 10h14M9 4.5v3M15 4.5v3" />
    </svg>
  );
}

function CustomerKpiSpark({ tone }: { tone: CustomerKpiTone }) {
  const points = CUSTOMER_KPI_TONES[tone].spark;
  const w = 92;
  const h = 26;
  const min = Math.min(...points);
  const max = Math.max(...points);
  const span = max - min || 1;
  const d = points
    .map((point, i) => {
      const x = (i / (points.length - 1)) * w;
      const y = h - 3 - ((point - min) / span) * (h - 8);
      return `${i === 0 ? "M" : "L"}${x.toFixed(1)} ${y.toFixed(1)}`;
    })
    .join(" ");
  return (
    <svg className="customer-kpi-spark" viewBox={`0 0 ${w} ${h}`} aria-hidden>
      <path d={d} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function CustomerKpiCard({
  tone,
  icon,
  label,
  value,
  hint,
  detail,
  active,
  onClick,
}: {
  tone: CustomerKpiTone;
  icon: "db" | "calendar" | "file";
  label: string;
  value: string;
  hint: string;
  detail?: boolean;
  active?: boolean;
  onClick: () => void;
}) {
  return (
    <button type="button" className={`customer-kpi customer-kpi-${tone}${active ? " active" : ""}`} onClick={onClick}>
      <span className="customer-kpi-icon">
        <CustomerKpiIcon name={icon} />
      </span>
      <span className="label">{label}</span>
      <span className="value">{value}</span>
      <span className="hint">{hint}</span>
      <span className="customer-kpi-foot">
        {detail ? (
          <span className="customer-kpi-detail">
            <CustomerKpiIcon name="user" />
            ดูรายละเอียด
          </span>
        ) : (
          <CustomerKpiSpark tone={tone} />
        )}
      </span>
    </button>
  );
}

function CustomersPanel({
  data,
  silentDays,
  onSilentDays,
  onPage,
}: {
  data: CustomersResult;
  silentDays: string;
  onSilentDays: (value: string | null) => void;
  onPage: (page: number) => void;
}) {
  const [sortKey, setSortKey] = useState<CustomerSortKey>("silentDays");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const rows = useMemo(
    () => [...data.rows].sort((a, b) => compareCustomers(a, b, sortKey, sortDir)),
    [data.rows, sortKey, sortDir]
  );
  const weightKg = rows.reduce((sum, row) => sum + row.weightKg, 0);
  const amount = rows.reduce((sum, row) => sum + row.amount, 0);
  const tickets = rows.reduce((sum, row) => sum + row.tickets, 0);
  const total = data.total ?? rows.length;
  const pageSize = data.pageSize || 1000;
  const page = data.page || 1;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const counts = data.silentCounts ?? { 30: 0, 60: 0, 90: data.silent90 ?? 0, 180: 0, 365: 0 };
  const onSort = (key: CustomerSortKey) => {
    if (key === sortKey) setSortDir((prev) => (prev === "asc" ? "desc" : "asc"));
    else {
      setSortKey(key);
      setSortDir(key === "name" || key === "group" || key === "tel" || key === "code" ? "asc" : "desc");
    }
  };

  return (
    <div>
      <div className="customer-silent-kpis">
        <CustomerKpiCard
          tone="mint"
          icon="db"
          label="ลูกค้าในช่วงตัวกรอง"
          value={formatNumber(total, 0)}
          hint="มีใบหรืออยู่ในกลุ่มที่เลือก"
          detail
          active={!silentDays}
          onClick={() => {
            onSilentDays(null);
            document.getElementById("customer-list")?.scrollIntoView({ behavior: "smooth", block: "start" });
          }}
        />
        {CUSTOMER_SILENT_BUCKETS.map((days) => (
          <CustomerKpiCard
            key={days}
            tone={SILENT_KPI_TONES[days]}
            icon="calendar"
            label={`หายเกิน ${days} วัน`}
            value={formatNumber(counts[days], 0)}
            hint={customerShareHint(counts[days], total)}
            active={silentDays === String(days)}
            onClick={() => onSilentDays(silentDays === String(days) ? null : String(days))}
          />
        ))}
        <CustomerKpiCard
          tone="sky"
          icon="file"
          label="ยังไม่เคยมา"
          value={formatNumber(data.neverSold, 0)}
          hint={customerShareHint(data.neverSold, total)}
          active={silentDays === "never"}
          onClick={() => onSilentDays(silentDays === "never" ? null : "never")}
        />
      </div>
      <div className="panel" id="customer-list">
        <h2>
          รายชื่อลูกค้า · หน้า {formatNumber(page, 0)} / {formatNumber(pageCount, 0)} · ทั้งสิ้น {formatNumber(total, 0)} คน
        </h2>
        {rows.length === 0 ? (
          <p className="muted">ไม่มีลูกค้าในช่วงตัวกรองนี้</p>
        ) : (
          <div className="pivot-wrap customers-wrap">
            <table className="pivot">
              <thead>
                <tr>
                  <SortTh label="ชื่อ" sortKey="name" current={sortKey} dir={sortDir} onSort={onSort} />
                  <SortTh label="กลุ่ม" sortKey="group" current={sortKey} dir={sortDir} onSort={onSort} />
                  <SortTh label="เบอร์โทร" sortKey="tel" current={sortKey} dir={sortDir} onSort={onSort} />
                  <SortTh label="รหัส" sortKey="code" current={sortKey} dir={sortDir} onSort={onSort} />
                  <SortTh label="มาล่าสุด" sortKey="lastPaidAt" current={sortKey} dir={sortDir} onSort={onSort} />
                  <SortTh label="หายไปกี่วัน" sortKey="silentDays" current={sortKey} dir={sortDir} onSort={onSort} className="right" />
                  <SortTh label="ใบปีนี้" sortKey="tickets" current={sortKey} dir={sortDir} onSort={onSort} className="right" />
                  <SortTh label="น้ำหนักปีนี้" sortKey="weightKg" current={sortKey} dir={sortDir} onSort={onSort} className="right" />
                  <SortTh label="ยอดปีนี้" sortKey="amount" current={sortKey} dir={sortDir} onSort={onSort} className="right" />
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.sellerId}>
                    <td>{row.name ?? "—"}</td>
                    <td>{row.group}</td>
                    <td>{row.tel ?? "—"}</td>
                    <td>{row.code ?? "—"}</td>
                    <td>{formatCustomerDay(row.lastPaidAt)}</td>
                    <td className="right">{row.neverSold ? "—" : formatNumber(row.silentDays ?? 0)}</td>
                    <td className="right">{formatNumber(row.tickets)}</td>
                    <td className="right">{formatDecimal(row.weightKg, 2)}</td>
                    <td className="right">{formatDecimal(row.amount, 2)}</td>
                  </tr>
                ))}
                <tr className="pivot-total">
                  <td>รวมหน้านี้ {formatNumber(rows.length, 0)} คน</td>
                  <td></td>
                  <td></td>
                  <td></td>
                  <td></td>
                  <td></td>
                  <td className="right">{formatNumber(tickets)}</td>
                  <td className="right">{formatDecimal(weightKg, 2)}</td>
                  <td className="right">{formatDecimal(amount, 2)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        )}
        {pageCount > 1 ? (
          <div className="pager">
            <button type="button" className="pill" disabled={page <= 1} onClick={() => onPage(page - 1)}>
              ก่อนหน้า
            </button>
            {pagerPages(page, pageCount).map((item, i) =>
              item === "…" ? (
                <span key={`e${i}`} className="muted">
                  …
                </span>
              ) : (
                <button
                  key={item}
                  type="button"
                  className={`pill ${item === page ? "active" : ""}`}
                  onClick={() => onPage(item)}
                >
                  {item}
                </button>
              )
            )}
            <button type="button" className="pill" disabled={page >= pageCount} onClick={() => onPage(page + 1)}>
              ถัดไป
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function SalesProfitPanel({
  data,
  onPage,
}: {
  data: SalesProfitResult;
  onPage: (page: number) => void;
}) {
  const total = data.total ?? data.tickets;
  const pageSize = data.pageSize || 1000;
  const page = data.page || 1;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const monthly = data.monthly.map((row) => ({
    label: THAI_MONTHS_SHORT[row.month - 1],
    profit: row.profit,
    cost: row.cost,
  }));
  const daily = data.daily.map((row) => ({
    label: row.day.slice(8, 10),
    profit: row.profit,
    cost: row.cost,
  }));

  return (
    <div>
      <p className="muted">{data.note}</p>
      <div className="grid grid-4">
        <div className="card kpi-card">
          <div className="label">ยอดขาย</div>
          <div className="value">{formatMoney(data.net)} บาท</div>
          <div className="hint">หัวตั๋วขาย net</div>
        </div>
        <div className="card kpi-card">
          <div className="label">ต้นทุนขาย</div>
          <div className="value">{formatMoney(data.cost)} บาท</div>
          <div className="hint">หัวตั๋วขาย cost</div>
        </div>
        <div className="card kpi-card">
          <div className="label">กำไรจากการขาย</div>
          <div className="value">{formatMoney(data.profit)} บาท</div>
          <div className="hint">ไม่ใช่ส่วนต่างขาย−ซื้อ และไม่ใช่กำไรสุทธิ</div>
        </div>
        <div className="card kpi-card">
          <div className="label">จำนวนใบ</div>
          <div className="value">{formatNumber(data.tickets, 0)}</div>
          <div className="hint">น้ำหนักคลัง {formatNumber(data.weight, 0)}</div>
        </div>
      </div>
      <div className="chart-grid">
        <div className="card panel chart-card">
          <div className="label">กำไรจากการขายรายเดือน</div>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={monthly}>
              <CartesianGrid strokeDasharray="3 3" stroke="#d9d2c5" />
              <XAxis dataKey="label" tick={{ fontSize: 12 }} />
              <YAxis width={64} tick={{ fontSize: 11 }} tickFormatter={(v) => formatAxis(Number(v), "amount")} />
              <Tooltip formatter={(v) => formatMoney(Number(v))} />
              <Legend />
              <Bar dataKey="profit" name="กำไรจากการขาย" fill="#c5a028" radius={[4, 4, 0, 0]} />
              <Bar dataKey="cost" name="ต้นทุนขาย" fill="#8a97a8" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div className="card panel chart-card">
          <div className="label">กำไรจากการขายรายวัน</div>
          <ResponsiveContainer width="100%" height={260}>
            <LineChart data={daily}>
              <CartesianGrid strokeDasharray="3 3" stroke="#d9d2c5" />
              <XAxis dataKey="label" tick={{ fontSize: 11 }} interval="preserveStartEnd" minTickGap={24} />
              <YAxis width={64} tick={{ fontSize: 11 }} tickFormatter={(v) => formatAxis(Number(v), "amount")} />
              <Tooltip formatter={(v) => formatMoney(Number(v))} />
              <Legend />
              <Line type="monotone" dataKey="profit" name="กำไรจากการขาย" stroke="#c5a028" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="cost" name="ต้นทุนขาย" stroke="#8a97a8" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
      <div className="panel">
        <h2>
          ใบขายจ่ายแล้ว · หน้า {formatNumber(page, 0)} / {formatNumber(pageCount, 0)} · ทั้งสิ้น {formatNumber(total, 0)} ใบ
        </h2>
        {data.rows.length === 0 ? (
          <p className="muted">ไม่มีใบขายในช่วงตัวกรองนี้</p>
        ) : (
          <div className="pivot-wrap">
            <table className="pivot">
              <thead>
                <tr>
                  <th>เลขที่</th>
                  <th>วันที่จ่าย</th>
                  <th>ผู้ซื้อ</th>
                  <th className="right">ยอด</th>
                  <th className="right">ต้นทุน</th>
                  <th className="right">กำไรจากการขาย</th>
                  <th className="right">น้ำหนักคลัง</th>
                </tr>
              </thead>
              <tbody>
                {data.rows.map((row) => (
                  <tr key={row.id}>
                    <td>
                      <Link href={`/tickets/out/${row.id}`}>{row.number ?? row.id.slice(0, 8)}</Link>
                    </td>
                    <td>{formatWhen(row.paidAt)}</td>
                    <td>{row.buyerName ?? "—"}</td>
                    <td className="right">{formatMoney(row.net)}</td>
                    <td className="right">{formatMoney(row.cost)}</td>
                    <td className="right">{formatMoney(row.profit)}</td>
                    <td className="right">{formatNumber(row.weight, 0)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {pageCount > 1 ? (
          <div className="pager">
            <button type="button" className="pill" disabled={page <= 1} onClick={() => onPage(page - 1)}>
              ก่อนหน้า
            </button>
            {pagerPages(page, pageCount).map((item, i) =>
              item === "…" ? (
                <span key={`e${i}`} className="muted">
                  …
                </span>
              ) : (
                <button
                  key={item}
                  type="button"
                  className={`pill ${item === page ? "active" : ""}`}
                  onClick={() => onPage(item)}
                >
                  {item}
                </button>
              )
            )}
            <button type="button" className="pill" disabled={page >= pageCount} onClick={() => onPage(page + 1)}>
              ถัดไป
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function monthFromChartClick(payload: unknown): number | null {
  if (!payload || typeof payload !== "object") return null;
  const rec = payload as { month?: unknown; payload?: { month?: unknown } };
  const next = Number(rec.month ?? rec.payload?.month);
  return Number.isInteger(next) && next >= 1 && next <= 12 ? next : null;
}

function TransformPanel({
  data,
  collapsed,
  onToggle,
  onSelectMonth,
}: {
  data: StockTransformsResult;
  collapsed: Set<string>;
  onToggle: (key: string) => void;
  onSelectMonth: (month: number) => void;
}) {
  const monthly = data.monthly.map((row) => ({
    month: row.month,
    label: THAI_MONTHS_SHORT[row.month - 1],
    inputKg: row.inputKg,
    outputKg: row.outputKg,
  }));
  const monthLabel = `${THAI_MONTHS_SHORT[data.month - 1]} ${data.beYear}`;

  return (
    <div>
      <p className="muted">{data.note}</p>
      <div className="grid grid-4">
        <div className="card kpi-card">
          <div className="label">ครั้งแปรสภาพ · {monthLabel}</div>
          <div className="value">{formatNumber(data.transforms, 0)}</div>
        </div>
        <div className="card kpi-card">
          <div className="label">น้ำหนักเข้า</div>
          <div className="value">{formatNumber(data.inputKg, 0)} กก.</div>
          <div className="hint">weight × kg_conversion</div>
        </div>
        <div className="card kpi-card">
          <div className="label">น้ำหนักออก</div>
          <div className="value">{formatNumber(data.outputKg, 0)} กก.</div>
        </div>
        <div className="card kpi-card">
          <div className="label">ส่วนต่างน้ำหนักออก−เข้า</div>
          <div className="value">{formatNumber(data.deltaKg, 0)} กก.</div>
          <div className="hint">ไม่ใช่เงิน — รายการนี้ไม่มีราคา</div>
        </div>
      </div>
      <div className="card panel chart-card">
        <div className="label">น้ำหนักเข้า / ออก ทั้งปี {data.beYear} · กดแท่งเพื่อเลือกเดือน</div>
        <ResponsiveContainer width="100%" height={260}>
          <BarChart data={monthly}>
            <CartesianGrid strokeDasharray="3 3" stroke="#d9d2c5" />
            <XAxis dataKey="label" tick={{ fontSize: 12 }} />
            <YAxis width={64} tick={{ fontSize: 11 }} tickFormatter={(v) => formatAxis(Number(v), "weight")} />
            <Tooltip formatter={(v) => `${formatNumber(Number(v), 0)} กก.`} />
            <Legend />
            <Bar
              dataKey="inputKg"
              name="เข้า"
              radius={[4, 4, 0, 0]}
              cursor="pointer"
              onClick={(entry) => {
                const next = monthFromChartClick(entry);
                if (next) onSelectMonth(next);
              }}
            >
              {monthly.map((row) => (
                <Cell key={`in-${row.month}`} fill={row.month === data.month ? "#3d5a80" : "#b7c4d4"} />
              ))}
            </Bar>
            <Bar
              dataKey="outputKg"
              name="ออก"
              radius={[4, 4, 0, 0]}
              cursor="pointer"
              onClick={(entry) => {
                const next = monthFromChartClick(entry);
                if (next) onSelectMonth(next);
              }}
            >
              {monthly.map((row) => (
                <Cell key={`out-${row.month}`} fill={row.month === data.month ? "#1f6b3a" : "#b8d4c2"} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
      <div className="panel">
        <h2>
          รายการแปรสภาพ · {monthLabel} · {formatNumber(data.total, 0)} ครั้ง
        </h2>
        {data.rows.length === 0 ? (
          <p className="muted">ไม่มีแปรสภาพในเดือนนี้</p>
        ) : (
          <div className="pivot-wrap">
            <table className="pivot">
              <thead>
                <tr>
                  <th>วันที่</th>
                  <th>ผู้บันทึก</th>
                  <th className="right">บรรทัดเข้า</th>
                  <th className="right">บรรทัดออก</th>
                  <th className="right">กก. เข้า</th>
                  <th className="right">กก. ออก</th>
                </tr>
              </thead>
              <tbody>
                {data.rows.map((row) => {
                  const open = !collapsed.has(row.id);
                  const inputs = row.items.filter((item) => item.direction === "input");
                  const outputs = row.items.filter((item) => item.direction === "output");
                  return (
                    <Fragment key={row.id}>
                      <tr className="pivot-group">
                        <td>
                          <button type="button" className="pivot-toggle" onClick={() => onToggle(row.id)} aria-expanded={open}>
                            {open ? "−" : "+"}
                          </button>{" "}
                          {formatWhen(row.createdAt)}
                        </td>
                        <td>{row.recordedByName ?? "—"}</td>
                        <td className="right">{formatNumber(row.inputLines, 0)}</td>
                        <td className="right">{formatNumber(row.outputLines, 0)}</td>
                        <td className="right">{formatNumber(row.inputKg, 0)}</td>
                        <td className="right">{formatNumber(row.outputKg, 0)}</td>
                      </tr>
                      {open
                        ? [...inputs, ...outputs].map((item, idx) => (
                            <tr key={`${row.id}-${item.direction}-${idx}`}>
                              <td colSpan={2}>
                                {item.direction === "input" ? "เข้า" : "ออก"} · {item.code ?? "—"} {item.name ?? ""}
                              </td>
                              <td>{item.branchCode ?? "—"}</td>
                              <td>{item.itemGroup ?? "—"}</td>
                              <td className="right">{formatDecimal(item.weight, 2)}</td>
                              <td className="right">{formatNumber(item.weightKg, 0)}</td>
                            </tr>
                          ))
                        : null}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function pagerPages(page: number, pageCount: number): Array<number | "…"> {
  if (pageCount <= 7) return Array.from({ length: pageCount }, (_, i) => i + 1);
  const pages = new Set([1, 2, pageCount - 1, pageCount, page - 1, page, page + 1]);
  const ordered = [...pages].filter((n) => n >= 1 && n <= pageCount).sort((a, b) => a - b);
  const out: Array<number | "…"> = [];
  for (const n of ordered) {
    if (out.length && typeof out[out.length - 1] === "number" && n - (out[out.length - 1] as number) > 1) out.push("…");
    out.push(n);
  }
  return out;
}

function CustomerMonthPanel({
  data,
  metric,
  countLabel,
  title,
  onPage,
}: {
  data: CustomerPurchasesResult;
  metric: Metric;
  countLabel: string;
  title: string;
  onPage: (page: number) => void;
}) {
  const monthsKey = metric === "weight" ? "weightKgMonths" : "amountMonths";
  const totalKey = metric === "weight" ? "weightKgTotal" : "amountTotal";
  const rows = data.rows;
  const total = data.total ?? data.customerCount ?? rows.length;
  const pageSize = data.pageSize || 1000;
  const page = data.page || 1;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const monthTotals = Array.from({ length: 12 }, (_, i) => rows.reduce((sum, row) => sum + row[monthsKey][i], 0));
  const grand = rows.reduce((sum, row) => sum + row[totalKey], 0);

  return (
    <div>
      <div className="grid grid-4">
        <div className="card">
          <div className="label">{countLabel} ปี {data.beYear}</div>
          <div className="value">{formatNumber(total, 0)}</div>
        </div>
        <div className="card">
          <div className="label">ใบจ่ายแล้ว</div>
          <div className="value">{formatNumber(data.tickets)}</div>
        </div>
        <div className="card">
          <div className="label">น้ำหนักปี {data.beYear}</div>
          <div className="value">{formatNumber(data.weightKg, 0)}</div>
          <div className="hint">น้ำหนักสุทธิ × kg_conversion</div>
        </div>
        <div className="card">
          <div className="label">ยอดปี {data.beYear}</div>
          <div className="value">{formatMoney(data.amount)} บาท</div>
          <div className="hint">น้ำหนักสุทธิ × ราคาจ่าย</div>
        </div>
      </div>
      <div className="panel">
        <h2>
          {title} · หน้า {formatNumber(page, 0)} / {formatNumber(pageCount, 0)} · ทั้งสิ้น {formatNumber(total, 0)} คน ·{" "}
          {metric === "weight" ? "กิโลกรัม" : "บาท"}
        </h2>
        {rows.length === 0 ? (
          <p className="muted">ไม่มีลูกค้าในช่วงตัวกรองนี้</p>
        ) : (
          <div className="pivot-wrap customer-buy-wrap">
            <table className="pivot customer-buy-pivot">
              <thead>
                <tr>
                  <th>ชื่อ</th>
                  <th>กลุ่ม</th>
                  {THAI_MONTHS_SHORT.map((month) => (
                    <th key={month} className="right">
                      {month}
                    </th>
                  ))}
                  <th className="right">รวม</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.sellerId}>
                    <td>{row.name ?? "—"}</td>
                    <td>{row.group}</td>
                    {row[monthsKey].map((value, idx) => (
                      <td key={idx} className="right">
                        {formatNumber(value, 0)}
                      </td>
                    ))}
                    <td className="right">{formatNumber(row[totalKey], 0)}</td>
                  </tr>
                ))}
                <tr className="pivot-total">
                  <td>รวมหน้านี้ {formatNumber(rows.length, 0)} คน</td>
                  <td></td>
                  {monthTotals.map((value, idx) => (
                    <td key={idx} className="right">
                      {formatNumber(value, 0)}
                    </td>
                  ))}
                  <td className="right">{formatNumber(grand, 0)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        )}
        {pageCount > 1 ? (
          <div className="pager">
            <button type="button" className="pill" disabled={page <= 1} onClick={() => onPage(page - 1)}>
              ก่อนหน้า
            </button>
            {pagerPages(page, pageCount).map((item, i) =>
              item === "…" ? (
                <span key={`e${i}`} className="muted">
                  …
                </span>
              ) : (
                <button
                  key={item}
                  type="button"
                  className={`pill ${item === page ? "active" : ""}`}
                  onClick={() => onPage(item)}
                >
                  {item}
                </button>
              )
            )}
            <button type="button" className="pill" disabled={page >= pageCount} onClick={() => onPage(page + 1)}>
              ถัดไป
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function formatUnit(unit: string | null): string {
  if (!unit) return "—";
  if (unit === "unit_kilogram") return "กก.";
  return unit.startsWith("unit_") ? unit.slice(5) : unit;
}

function formatAvgPaid(amount: number, weight: number): string {
  return weight > 0 ? formatMoney(amount / weight) : "—";
}

function groupStockRows(rows: StockProduct[]) {
  const groups = new Map<
    string,
    {
      key: string;
      branchCode: string | null;
      stockQty: number;
      weightKg: number;
      estimatedValue: number;
      buyAmount: number;
      buyWeight: number;
      items: Array<{
        key: string;
        itemGroup: string | null;
        stockQty: number;
        weightKg: number;
        estimatedValue: number;
        buyAmount: number;
        buyWeight: number;
        products: StockProduct[];
      }>;
    }
  >();
  for (const row of rows) {
    const branchKey = row.branchCode ?? "";
    let group = groups.get(branchKey);
    if (!group) {
      group = {
        key: `b:${branchKey}`,
        branchCode: row.branchCode,
        stockQty: 0,
        weightKg: 0,
        estimatedValue: 0,
        buyAmount: 0,
        buyWeight: 0,
        items: [],
      };
      groups.set(branchKey, group);
    }
    const itemKey = `${branchKey}\t${row.itemGroup ?? ""}`;
    let item = group.items.find((entry) => entry.key === `g:${itemKey}`);
    if (!item) {
      item = {
        key: `g:${itemKey}`,
        itemGroup: row.itemGroup,
        stockQty: 0,
        weightKg: 0,
        estimatedValue: 0,
        buyAmount: 0,
        buyWeight: 0,
        products: [],
      };
      group.items.push(item);
    }
    item.products.push(row);
    item.stockQty += row.stockQty;
    item.weightKg += row.weightKg;
    item.estimatedValue += row.estimatedValue;
    item.buyAmount += row.buyAmount;
    item.buyWeight += row.buyWeight;
    group.stockQty += row.stockQty;
    group.weightKg += row.weightKg;
    group.estimatedValue += row.estimatedValue;
    group.buyAmount += row.buyAmount;
    group.buyWeight += row.buyWeight;
  }
  return [...groups.values()];
}

function StockPanel({
  data,
  collapsed,
  onToggle,
}: {
  data: StockResult;
  collapsed: Set<string>;
  onToggle: (key: string) => void;
}) {
  const groups = useMemo(() => groupStockRows(data.rows), [data.rows]);
  const totalBuyAmount = data.rows.reduce((sum, row) => sum + row.buyAmount, 0);
  const totalBuyWeight = data.rows.reduce((sum, row) => sum + row.buyWeight, 0);
  return (
    <div>
      <div className="grid grid-4">
        <div className="card">
          <div className="label">รายการที่มีสต็อก</div>
          <div className="value">{formatNumber(data.productCount)}</div>
        </div>
        <div className="card">
          <div className="label">ปริมาณคลัง</div>
          <div className="value">{formatDecimal(data.stockQty, 2)}</div>
        </div>
        <div className="card">
          <div className="label">น้ำหนัก (กก.)</div>
          <div className="value">{formatDecimal(data.weightKg, 2)}</div>
          <div className="hint">คงเหลือ × kg_conversion</div>
        </div>
        <div className="card">
          <div className="label">มูลค่าประมาณ</div>
          <div className="value">{formatMoney(data.estimatedValue)} บาท</div>
          <div className="hint">คงเหลือ × ราคาตั้งต้น</div>
        </div>
      </div>
      <div className="panel">
        <h2>
          สต็อกตามสาขาและหมวด · ราคาถัวเฉลี่ย {data.from} – {data.to}
        </h2>
        {data.rows.length === 0 ? (
          <p className="muted">ไม่มีสินค้าที่มียอดคงเหลือในช่วงตัวกรองนี้</p>
        ) : (
          <div className="pivot-wrap">
            <table className="pivot">
              <thead>
                <tr>
                  <th>สาขา</th>
                  <th>หมวด</th>
                  <th>รหัส</th>
                  <th>สินค้า</th>
                  <th className="right">คงเหลือ</th>
                  <th className="right">กก.</th>
                  <th>หน่วย</th>
                  <th className="right">ราคาตั้งต้น</th>
                  <th className="right">ราคาถัวเฉลี่ย</th>
                  <th className="right">มูลค่าประมาณ</th>
                </tr>
              </thead>
              <tbody>
                {groups.map((group) => {
                  const branchOpen = !collapsed.has(group.key);
                  return (
                    <Fragment key={group.key}>
                      <tr className="pivot-group">
                        <td>
                          <button type="button" className="pivot-toggle" onClick={() => onToggle(group.key)} aria-expanded={branchOpen}>
                            {branchOpen ? "−" : "+"}
                          </button>{" "}
                          {group.branchCode ?? "ไม่ระบุ"}
                        </td>
                        <td></td>
                        <td></td>
                        <td></td>
                        <td className="right">{formatDecimal(group.stockQty, 2)}</td>
                        <td className="right">{formatDecimal(group.weightKg, 2)}</td>
                        <td></td>
                        <td></td>
                        <td className="right">{formatAvgPaid(group.buyAmount, group.buyWeight)}</td>
                        <td className="right">{formatDecimal(group.estimatedValue, 2)}</td>
                      </tr>
                      {branchOpen
                        ? group.items.map((item) => {
                            const groupOpen = !collapsed.has(item.key);
                            return (
                              <Fragment key={item.key}>
                                <tr className="pivot-item">
                                  <td></td>
                                  <td>
                                    <button type="button" className="pivot-toggle" onClick={() => onToggle(item.key)} aria-expanded={groupOpen}>
                                      {groupOpen ? "−" : "+"}
                                    </button>{" "}
                                    {item.itemGroup ?? "ไม่ระบุ"}
                                  </td>
                                  <td></td>
                                  <td></td>
                                  <td className="right">{formatDecimal(item.stockQty, 2)}</td>
                                  <td className="right">{formatDecimal(item.weightKg, 2)}</td>
                                  <td></td>
                                  <td></td>
                                  <td className="right">{formatAvgPaid(item.buyAmount, item.buyWeight)}</td>
                                  <td className="right">{formatDecimal(item.estimatedValue, 2)}</td>
                                </tr>
                                {groupOpen
                                  ? item.products.map((row) => (
                                      <tr key={row.id}>
                                        <td></td>
                                        <td></td>
                                        <td>{row.code ?? "—"}</td>
                                        <td>{row.name ?? "—"}</td>
                                        <td className="right">{formatDecimal(row.stockQty, 2)}</td>
                                        <td className="right">{formatDecimal(row.weightKg, 2)}</td>
                                        <td>{formatUnit(row.unit)}</td>
                                        <td className="right">{formatDecimal(row.basePrice, 2)}</td>
                                        <td className="right">{formatAvgPaid(row.buyAmount, row.buyWeight)}</td>
                                        <td className="right">{formatDecimal(row.estimatedValue, 2)}</td>
                                      </tr>
                                    ))
                                  : null}
                              </Fragment>
                            );
                          })
                        : null}
                    </Fragment>
                  );
                })}
                <tr className="pivot-total">
                  <td colSpan={4}>Grand total</td>
                  <td className="right">{formatDecimal(data.stockQty, 2)}</td>
                  <td className="right">{formatDecimal(data.weightKg, 2)}</td>
                  <td></td>
                  <td></td>
                  <td className="right">{formatAvgPaid(totalBuyAmount, totalBuyWeight)}</td>
                  <td className="right">{formatDecimal(data.estimatedValue, 2)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function OpenTicketsPanel({ data }: { data: OpenTicketsResult }) {
  return (
    <div>
      <div className="grid grid-4">
        <div className="card">
          <div className="label">ซื้อค้าง</div>
          <div className="value">{formatNumber(data.openIn)}</div>
        </div>
        <div className="card">
          <div className="label">ขายค้าง</div>
          <div className="value">{formatNumber(data.openOut)}</div>
        </div>
        <div className="card">
          <div className="label">เกิน 24 ชม.</div>
          <div className="value">{formatNumber(data.over24)}</div>
          <div className="hint">เกณฑ์ที่กำหนดเอง ไม่มีใน Scrapee</div>
        </div>
        <div className="card">
          <div className="label">แสดงในตาราง</div>
          <div className="value">{formatNumber(data.rows.length)}</div>
          <div className="hint">{data.rows.length >= 1000 ? "จำกัด 1,000 ใบต่อฝั่ง" : "เรียงอายุมากก่อน"}</div>
        </div>
      </div>
      {data.openIn + data.openOut === 0 ? (
        <p className="muted">ไม่มีตั๋วที่ยังไม่ปิดในช่วงตัวกรองนี้</p>
      ) : (
        <div className="panel">
          <h2>ตั๋วที่ยังไม่ปิด</h2>
          <table>
            <thead>
              <tr>
                <th>ประเภท</th>
                <th>เลขที่</th>
                <th>สถานะ</th>
                <th>คู่ค้า</th>
                <th>ผู้บันทึก</th>
                <th>สาขา</th>
                <th>หมวด</th>
                <th className="right">ยอด</th>
                <th className="right">น้ำหนักคลัง</th>
                <th>สร้าง</th>
                <th className="right">อายุ</th>
              </tr>
            </thead>
            <tbody>
              {data.rows.map((row) => (
                <tr key={`${row.side}-${row.id}`}>
                  <td>{row.side === "in" ? "ซื้อ" : "ขาย"}</td>
                  <td>
                    <Link href={`/tickets/${row.side}/${row.id}`}>{row.runningNumber ?? row.number ?? row.id.slice(0, 8)}</Link>
                  </td>
                  <td>{row.status ?? "—"}</td>
                  <td>{row.counterparty ?? "—"}</td>
                  <td>{row.recordedByName ?? "—"}</td>
                  <td>{row.branches.join(", ") || "—"}</td>
                  <td>{row.itemGroups.join(", ") || "—"}</td>
                  <td className="right">{formatMoney(row.net)}</td>
                  <td className="right">{formatNumber(row.weight)}</td>
                  <td>{formatWhen(row.createdAt)}</td>
                  <td className="right">{formatHours(row.ageHours)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function LookupPanel({ query, result }: { query: string; result: TicketLookupResult | null }) {
  if (!query) {
    return <p className="muted">พิมพ์เลขที่ตั๋วแล้วกดค้นหา เพื่อดูใบซื้อและใบขายที่ตรงกัน</p>;
  }
  if (!result) return null;
  if (result.matches === 0) {
    return <p className="muted">ไม่พบตั๋วเลขที่ {result.query}</p>;
  }
  return (
    <div>
      {result.duplicateWarning ? <div className="note">{result.duplicateWarning}</div> : null}
      <p className="muted">
        พบ {result.matches} เอกสารสำหรับเลขที่ {result.query} — หนึ่งการ์ดต่อ id
      </p>
      {result.tickets.map((ticket) => (
        <article key={`${ticket.side}-${ticket.id}`} className="card panel lookup-card">
          <div className="trade-title-row">
            <div>
              <h2>
                {ticket.side === "in" ? "ตั๋วซื้อ" : "ตั๋วขาย"} {ticket.runningNumber ?? ticket.number ?? ticket.id}
              </h2>
              <div className="sub">
                สถานะ {ticket.status ?? "—"}
                {ticket.isDeleted ? " · ถูกลบจากคลัง" : ""} · ผู้บันทึก {ticket.recordedByName ?? "—"} ·{" "}
                {ticket.side === "in" ? "ผู้ขาย" : "ผู้ซื้อ"} {ticket.counterparty ?? "—"}
              </div>
            </div>
            <Link className="pill nav-link" href={`/tickets/${ticket.side}/${ticket.id}`}>
              เปิดหน้าตั๋ว
            </Link>
          </div>
          <div className="grid grid-4">
            <div className="card">
              <div className="label">ยอดสุทธิ</div>
              <div className="value">{formatMoney(ticket.net)} บาท</div>
            </div>
            <div className="card">
              <div className="label">น้ำหนักคลัง</div>
              <div className="value">{formatNumber(ticket.weight)}</div>
            </div>
            <div className="card">
              <div className="label">{ticket.side === "in" ? "จ่ายเมื่อ" : "รับเงินเมื่อ"}</div>
              <div className="value" style={{ fontSize: 16 }}>
                {formatWhen(ticket.paidAt)}
              </div>
            </div>
            <div className="card">
              <div className="label">id</div>
              <div className="value" style={{ fontSize: 13 }}>
                {ticket.id}
              </div>
            </div>
          </div>
          <h2>รายการ</h2>
          {ticket.items.length === 0 ? (
            <p className="muted">ไม่มีรายการสินค้า</p>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>รหัส</th>
                  <th>ชื่อ</th>
                  <th>สาขาสินค้า</th>
                  <th>หมวด</th>
                  <th className="right">น้ำหนักคลัง</th>
                  <th className="right">ราคาจ่าย</th>
                </tr>
              </thead>
              <tbody>
                {ticket.items.map((item, idx) => (
                  <tr key={`${item.code ?? "row"}-${idx}`}>
                    <td>{item.code ?? "—"}</td>
                    <td>{item.name ?? "—"}</td>
                    <td>{item.branchCode ?? "—"}</td>
                    <td>{item.itemGroup ?? "—"}</td>
                    <td className="right">{formatNumber(item.weight)}</td>
                    <td className="right">{formatMoney(item.paidPrice)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </article>
      ))}
    </div>
  );
}

function parseListParam(raw: string): string[] {
  return [...new Set(raw.split(",").map((value) => value.trim()).filter(Boolean))];
}

function filterOptionLabel(code: string): string {
  return code === SMALL_IN_NONE ? "ไม่ระบุ" : code;
}

function uniqueCodes(list: string[] | undefined, extra: string | string[]): string[] {
  const set = new Set(list ?? []);
  const extras = Array.isArray(extra) ? extra : extra ? [extra] : [];
  for (const value of extras) {
    if (value) set.add(value);
  }
  return [...set].sort((a, b) => {
    if (a === SMALL_IN_NONE) return 1;
    if (b === SMALL_IN_NONE) return -1;
    return a.localeCompare(b, "th", { numeric: true });
  });
}

function MultiCheckFilter({
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
    selected.length === 0
      ? allLabel
      : selected.length <= 2
        ? selected.map(filterOptionLabel).join(", ")
        : `${selected.length} รายการ`;

  useEffect(() => {
    if (!open) return;
    function onDoc(ev: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(ev.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  function toggle(code: string) {
    const next = chosen.has(code) ? selected.filter((value) => value !== code) : [...selected, code];
    onChange(next);
  }

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
              <input type="checkbox" checked={chosen.has(code)} onChange={() => toggle(code)} />
              {filterOptionLabel(code)}
            </label>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function tradeLinesHref(opts: {
  side: "in" | "out";
  beYear: number;
  metric: Metric;
  branch?: string | null;
  itemGroup?: string | null;
  sellerId?: string | null;
  sellerName?: string | null;
  buyerId?: string | null;
  buyerName?: string | null;
  month?: number | null;
  backBranch?: string;
  backItemGroup?: string;
}): string {
  const p = new URLSearchParams();
  p.set("side", opts.side);
  p.set("year", String(opts.beYear));
  p.set("metric", opts.metric);
  if (opts.branch === null) p.set("branch", "__none__");
  else if (opts.branch) p.set("branch", opts.branch);
  if (opts.itemGroup === null) p.set("item_group", "__none__");
  else if (opts.itemGroup) p.set("item_group", opts.itemGroup);
  if (opts.side === "in" && opts.sellerId) {
    p.set("seller_id", opts.sellerId);
    if (opts.sellerName) p.set("seller", opts.sellerName);
  }
  if (opts.side === "out" && opts.buyerId) {
    p.set("buyer_id", opts.buyerId);
    if (opts.buyerName) p.set("buyer", opts.buyerName);
  }
  if (opts.month) p.set("month", String(opts.month));
  if (opts.backBranch) p.set("back_branch", opts.backBranch);
  if (opts.backItemGroup) p.set("back_item_group", opts.backItemGroup);
  return `/trade/lines?${p}`;
}

function clickableMetric(value: number, metric: Metric, href: string | null, key?: string | number) {
  if (!value) {
    return <td key={key} className="right"></td>;
  }
  const text = formatMetric(value, metric);
  return (
    <td key={key} className="right">
      {href ? (
        <Link className="pivot-num" href={href}>
          {text}
        </Link>
      ) : (
        text
      )}
    </td>
  );
}

function groupPivotRows(
  rows: TradePivotRow[],
  monthsKey: "amountMonths" | "weightKgMonths",
  totalKey: "amountTotal" | "weightKgTotal"
) {
  const groups = new Map<
    string,
    { key: string; branchCode: string | null; items: TradePivotRow[]; months: number[]; total: number }
  >();
  for (const row of rows) {
    const key = row.branchCode ?? "";
    let group = groups.get(key);
    if (!group) {
      group = { key, branchCode: row.branchCode, items: [], months: Array.from({ length: 12 }, () => 0), total: 0 };
      groups.set(key, group);
    }
    group.items.push(row);
    row[monthsKey].forEach((n, i) => {
      group!.months[i] += n;
    });
    group.total += row[totalKey];
  }
  return [...groups.values()];
}

function BranchItemPivot({
  data,
  metric,
  side,
  pageBranch,
  pageItemGroup,
  sellerId,
  sellerName,
  buyerId,
  buyerName,
  pivotMonths,
  pivotTotal,
  grand,
  disableLinks,
  collapsed,
  onToggle,
}: {
  data: TradeSummary;
  metric: Metric;
  side: "in" | "out";
  pageBranch: string;
  pageItemGroup: string;
  sellerId: string;
  sellerName: string;
  buyerId: string;
  buyerName: string;
  pivotMonths: "amountMonths" | "weightKgMonths";
  pivotTotal: "amountTotal" | "weightKgTotal";
  grand: { months: number[]; total: number };
  disableLinks?: boolean;
  collapsed: Set<string>;
  onToggle: (key: string) => void;
}) {
  const groups = useMemo(
    () => groupPivotRows(data.pivot, pivotMonths, pivotTotal),
    [data.pivot, pivotMonths, pivotTotal]
  );

  return (
    <table className="pivot">
      <thead>
        <tr>
          <th>ปี</th>
          <th>สาขา</th>
          <th>รหัสสินค้า</th>
          {THAI_MONTHS_SHORT.map((m) => (
            <th key={m} className="right">
              {m}
            </th>
          ))}
          <th className="right">รวม</th>
        </tr>
      </thead>
      <tbody>
        {groups.map((group, groupIdx) => {
          const open = !collapsed.has(group.key);
          return (
            <BranchGroupRows
              key={group.key || "none"}
              year={groupIdx === 0 ? data.beYear : null}
              group={group}
              open={open}
              metric={metric}
              side={side}
              beYear={data.beYear}
              pageBranch={pageBranch}
              pageItemGroup={pageItemGroup}
              sellerId={sellerId}
              sellerName={sellerName}
              buyerId={buyerId}
              buyerName={buyerName}
              pivotMonths={pivotMonths}
              pivotTotal={pivotTotal}
              disableLinks={disableLinks}
              onToggle={() => onToggle(group.key)}
            />
          );
        })}
        {groups.length > 0 ? (
          <tr className="pivot-total">
            <td></td>
            <td colSpan={2}>Grand total</td>
            {grand.months.map((n, i) =>
              clickableMetric(
                n,
                metric,
                disableLinks
                  ? null
                  : tradeLinesHref({
                      side,
                      beYear: data.beYear,
                      metric,
                      branch: pageBranch || undefined,
                      itemGroup: pageItemGroup || undefined,
                      sellerId,
                      sellerName,
                      buyerId,
                      buyerName,
                      month: i + 1,
                      backBranch: pageBranch,
                      backItemGroup: pageItemGroup,
                    }),
                i
              )
            )}
            {clickableMetric(
              grand.total,
              metric,
              disableLinks
                ? null
                : tradeLinesHref({
                    side,
                    beYear: data.beYear,
                    metric,
                    branch: pageBranch || undefined,
                    itemGroup: pageItemGroup || undefined,
                    sellerId,
                    sellerName,
                    buyerId,
                    buyerName,
                    backBranch: pageBranch,
                    backItemGroup: pageItemGroup,
                  }),
              "total"
            )}
          </tr>
        ) : null}
      </tbody>
    </table>
  );
}

function BranchGroupRows({
  year,
  group,
  open,
  metric,
  side,
  beYear,
  pageBranch,
  pageItemGroup,
  sellerId,
  sellerName,
  buyerId,
  buyerName,
  pivotMonths,
  pivotTotal,
  disableLinks,
  onToggle,
}: {
  year: number | null;
  group: { key: string; branchCode: string | null; items: TradePivotRow[]; months: number[]; total: number };
  open: boolean;
  metric: Metric;
  side: "in" | "out";
  beYear: number;
  pageBranch: string;
  pageItemGroup: string;
  sellerId: string;
  sellerName: string;
  buyerId: string;
  buyerName: string;
  pivotMonths: "amountMonths" | "weightKgMonths";
  pivotTotal: "amountTotal" | "weightKgTotal";
  disableLinks?: boolean;
  onToggle: () => void;
}) {
  const groupHref = (month?: number) =>
    disableLinks
      ? null
      : tradeLinesHref({
          side,
          beYear,
          metric,
          branch: group.branchCode,
          itemGroup: pageItemGroup || undefined,
          sellerId,
          sellerName,
          buyerId,
          buyerName,
          month,
          backBranch: pageBranch,
          backItemGroup: pageItemGroup,
        });

  return (
    <>
      <tr className="pivot-group">
        <td>{year != null ? year.toLocaleString("th-TH") : ""}</td>
        <td>
          <button type="button" className="pivot-toggle" onClick={onToggle} aria-expanded={open}>
            {open ? "−" : "+"}
          </button>{" "}
          {group.branchCode ?? "ไม่ระบุ"}
        </td>
        <td></td>
        {group.months.map((n, i) => clickableMetric(n, metric, groupHref(i + 1), i))}
        {clickableMetric(group.total, metric, groupHref(), "total")}
      </tr>
      {open
        ? group.items.map((row) => {
            const itemHref = (month?: number) =>
              disableLinks
                ? null
                : tradeLinesHref({
                    side,
                    beYear,
                    metric,
                    branch: row.branchCode,
                    itemGroup: row.itemGroup,
                    sellerId,
                    sellerName,
                    buyerId,
                    buyerName,
                    month,
                    backBranch: pageBranch,
                    backItemGroup: pageItemGroup,
                  });
            return (
              <tr key={`${row.branchCode ?? ""}-${row.itemGroup ?? ""}`} className="pivot-item">
                <td></td>
                <td></td>
                <td>{row.itemGroup ?? "ไม่ระบุ"}</td>
                {row[pivotMonths].map((n, i) => clickableMetric(n, metric, itemHref(i + 1), i))}
                {clickableMetric(row[pivotTotal], metric, itemHref(), "total")}
              </tr>
            );
          })
        : null}
    </>
  );
}

function SmallInPanel({ data }: { data: SmallInResult }) {
  const capLabel = formatNumber(data.cap, 0);
  const monthly = data.monthly.map((row) => ({
    label: THAI_MONTHS_SHORT[row.month - 1],
    value: row.amount,
  }));
  const daily = data.daily.map((row) => ({
    label: row.day.slice(5),
    value: row.amount,
  }));
  const groupSeries = data.itemGroups.map((row) => ({
    key: row.itemGroup ?? SMALL_IN_NONE,
    label: row.itemGroup ?? "ไม่ระบุ",
  }));
  const groupDayMap = new Map(
    (data.itemGroupDaily ?? []).map((row) => [`${row.day}\t${row.itemGroup ?? SMALL_IN_NONE}`, row.amount])
  );
  const groupDays = [
    ...new Set([
      ...data.daily.map((row) => row.day),
      ...(data.itemGroupDaily ?? []).map((row) => row.day),
    ]),
  ].sort();
  const groupDaily = groupDays.map((day) => {
    const point: Record<string, string | number> = { label: day.slice(5), day };
    for (const series of groupSeries) {
      point[series.key] = groupDayMap.get(`${day}\t${series.key}`) ?? 0;
    }
    return point;
  });
  const showGroupDots = groupSeries.length <= 6;

  return (
    <div>
      <div className="grid grid-4">
        <div className="card kpi-card">
          <div className="label">จำนวนใบ</div>
          <div className="value">{formatNumber(data.tickets, 0)}</div>
          <div className="hint">ตั๋วซื้อจ่ายแล้วที่ยอดใบน้อยกว่า {capLabel} บาท</div>
        </div>
        <div className="card kpi-card">
          <div className="label">ยอดรวม</div>
          <div className="value">{formatMoney(data.amount)} บาท</div>
          <div className="hint">ปี {data.beYear}</div>
        </div>
      </div>
      <div className="small-in-top">
        <div className="card panel chart-card">
          <div className="label">ยอดน้อยกว่า {capLabel} บาท / เดือน</div>
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={monthly} margin={{ top: 8, right: 8, left: 4, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#d9d2c5" />
              <XAxis dataKey="label" tick={{ fontSize: 12 }} />
              <YAxis width={64} tick={{ fontSize: 11 }} tickFormatter={(v) => formatAxis(Number(v), "amount")} />
              <Tooltip formatter={(v) => formatMoney(Number(v))} />
              <Bar dataKey="value" fill="#1d4f91" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div className="card panel">
          <div className="label">ยอดน้อยกว่า {capLabel} บาท / แต่ละสาขา</div>
          {data.branches.length === 0 ? (
            <p className="muted">ไม่มีตั๋วในช่วงนี้</p>
          ) : (
            <div className="pivot-wrap small-in-table-wrap">
              <table className="pivot small-in-table">
                <thead>
                  <tr>
                    <th>สาขา</th>
                    <th className="right">บาท</th>
                    <th className="right">เปอร์เซ็นต์</th>
                    <th className="right">จำนวนครั้ง</th>
                  </tr>
                </thead>
                <tbody>
                  {data.branches.map((row) => (
                    <tr key={row.branchCode ?? "none"}>
                      <td>{row.branchCode ?? "ไม่ระบุ"}</td>
                      <td className="right">{formatMoney(row.amount)}</td>
                      <td className="right">{formatNumber(row.share * 100, 1)}%</td>
                      <td className="right">{formatNumber(row.tickets, 0)}</td>
                    </tr>
                  ))}
                  <tr className="pivot-total">
                    <td>รวม</td>
                    <td className="right">{formatMoney(data.amount)}</td>
                    <td className="right">100.0%</td>
                    <td className="right">{formatNumber(data.tickets, 0)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
      <div className="card panel chart-card">
        <div className="label">ยอดน้อยกว่า {capLabel} บาท / วัน</div>
        <ResponsiveContainer width="100%" height={280}>
          <LineChart data={daily}>
            <CartesianGrid strokeDasharray="3 3" stroke="#d9d2c5" />
            <XAxis dataKey="label" tick={{ fontSize: 11 }} interval="preserveStartEnd" minTickGap={24} />
            <YAxis width={64} tick={{ fontSize: 11 }} tickFormatter={(v) => formatAxis(Number(v), "amount")} />
            <Tooltip formatter={(v) => formatMoney(Number(v))} labelFormatter={(l) => `วันที่ ${l}`} />
            <Line type="monotone" dataKey="value" stroke="#1d4f91" strokeWidth={2} dot={{ r: 2 }} />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <div className="card panel chart-card">
        <div className="label">ยอดน้อยกว่า {capLabel} บาท / หมวดหมู่สินค้า รายวัน</div>
        {groupSeries.length === 0 ? (
          <p className="muted">ไม่มีตั๋วในช่วงนี้</p>
        ) : (
          <ResponsiveContainer width="100%" height={360}>
            <LineChart data={groupDaily} margin={{ top: 8, right: 16, left: 4, bottom: 8 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#d9d2c5" />
              <XAxis dataKey="label" tick={{ fontSize: 11 }} interval="preserveStartEnd" minTickGap={24} />
              <YAxis width={64} tick={{ fontSize: 11 }} tickFormatter={(v) => formatAxis(Number(v), "amount")} />
              <Tooltip formatter={(v) => formatMoney(Number(v))} labelFormatter={(l) => `วันที่ ${l}`} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              {groupSeries.map((series, i) => (
                <Line
                  key={series.key}
                  type="monotone"
                  dataKey={series.key}
                  name={series.label}
                  stroke={LINE_COLORS[i % LINE_COLORS.length]}
                  strokeWidth={2}
                  dot={showGroupDots ? { r: 2 } : false}
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}

function KpiStrip({ data, metric, tab }: { data: TradeSummary; metric: Metric; tab: TradeSide }) {
  const main = metric === "weight" ? data.kpis.weightKg : data.kpis.amount;
  const mainLabel =
    tab === "profit"
      ? metric === "weight"
        ? "ส่วนต่างน้ำหนัก"
        : "ส่วนต่างขาย−ซื้อ"
      : tab === "out"
        ? metric === "weight"
          ? "น้ำหนักขาย"
          : "ยอดขาย"
        : metric === "weight"
          ? "น้ำหนักซื้อ"
          : "ยอดซื้อ";

  const ticketValue =
    tab === "profit" && data.kpis.purchaseTickets != null && data.kpis.salesTickets != null
      ? `${formatNumber(data.kpis.purchaseTickets)} / ${formatNumber(data.kpis.salesTickets)}`
      : formatNumber(data.kpis.tickets);

  return (
    <div className="grid grid-4">
      <Kpi
        label={mainLabel}
        value={formatCompact(main, metric)}
        hint={tab === "profit" ? (metric === "weight" ? "น้ำหนักขาย − น้ำหนักซื้อ" : "ยอดขาย − ยอดซื้อ") : metric === "weight" ? "แปลงด้วย kg_conversion" : undefined}
      />
      <Kpi
        label={tab === "profit" ? "ใบซื้อ / ใบขาย" : "จำนวนใบ"}
        value={ticketValue}
        hint={data.grain === "item" ? "นับจากรายการในรหัสนั้น" : "ตั๋วจ่ายแล้ว"}
      />
      <Kpi
        label={metric === "weight" ? "เฉลี่ยบาทต่อกก." : "เฉลี่ยต่อกก."}
        value={formatNumber(data.kpis.avgPerKg, 0)}
        hint={tab === "profit" ? "ส่วนต่างบาท ÷ น้ำหนักขาย" : "ยอด ÷ น้ำหนัก"}
      />
      {tab === "profit" && data.kpis.salesAmount != null && data.kpis.purchaseAmount != null ? (
        <Kpi
          label={metric === "weight" ? "น้ำหนักขาย / ซื้อ" : "ยอดขาย / ยอดซื้อ"}
          value={
            metric === "weight"
              ? `${formatNumber(data.kpis.salesWeightKg ?? 0, 0)} / ${formatNumber(data.kpis.purchaseWeightKg ?? 0, 0)} กก.`
              : `${formatMoney(data.kpis.salesAmount)} / ${formatMoney(data.kpis.purchaseAmount)}`
          }
          hint="ตัวตั้ง / ตัวลบ"
        />
      ) : (
        <Kpi
          label={metric === "amount" ? "น้ำหนักรวม" : "ยอดรวม"}
          value={formatCompact(metric === "amount" ? data.kpis.weightKg : data.kpis.amount, metric === "amount" ? "weight" : "amount")}
        />
      )}
    </div>
  );
}

function Kpi({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="card kpi-card">
      <div className="label">{label}</div>
      <div className="value">{value}</div>
      {hint ? <div className="hint">{hint}</div> : null}
    </div>
  );
}

function chartTitle(tab: TradeSide, metric: Metric, grain: "เดือน" | "วัน"): string {
  const unit = metric === "weight" ? "น้ำหนัก (กก.)" : tab === "profit" ? "ส่วนต่างขาย−ซื้อ (บาท)" : "ยอด (บาท)";
  return `สรุป${unit} ราย${grain}`;
}

function formatAxis(value: number, metric: Metric): string {
  if (Math.abs(value) >= 1_000_000) return `${formatNumber(value / 1_000_000, 0)} ล้าน`;
  if (Math.abs(value) >= 1_000) return `${formatNumber(value / 1_000, 0)} พัน`;
  return formatNumber(value, 0);
}
