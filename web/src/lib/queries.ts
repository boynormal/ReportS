import { getPool, num } from "./db";
import {
  bangkokDayStart,
  ceMonthRange,
  ceYearRange,
  currentCeYear,
  defaultYtdThroughMonth,
  rangeFromPreset,
  sqlDay,
  THAI_MONTHS_SHORT,
  toBuddhistYear,
  type DateRange,
} from "./dates";
import {
  changeOf,
  itemGroupName,
  withTicketsPerCustomer,
  type YearCompareCategory,
  type YearCompareFilters,
  type YearCompareMonth,
  type YearCompareResult,
  type YearCompareTotals,
} from "./year-compare-types";
import type { CustomerReportPerson, CustomerReportResult } from "./customer-report-types";
import type { SyncStatus } from "./sync-types";
import type { LookupTicket, LookupTicketItem, TicketLookupResult } from "./ticket-lookup-types";
import type { OpenTicketRow, OpenTicketsResult } from "./ticket-open-types";
import type { CustomerPurchaseRow, CustomerPurchasesResult } from "./customer-purchase-types";
import type { CustomerRow, CustomersResult, SellerChoice } from "./customer-types";
import { CUSTOMER_SILENT_BUCKETS } from "./customer-types";
import type { SmallInCap, SmallInFilters, SmallInResult } from "./small-in-types";
import { SMALL_IN_NONE } from "./small-in-types";
import type { SalesProfitResult } from "./sales-profit-types";
import type { StockProduct, StockResult } from "./stock-types";
import type { StockTransformsResult, TransformItem, TransformRow } from "./transform-types";
import type { TradeFilters, TradeLine, TradeLinesResult, TradeMonthPoint, TradePivotRow, TradeSide, TradeSummary } from "./trade-types";

export type { SyncStatus } from "./sync-types";
export type { LookupTicket, LookupTicketItem, TicketLookupResult } from "./ticket-lookup-types";
export type { OpenTicketRow, OpenTicketsResult } from "./ticket-open-types";
export type { CustomerPurchaseRow, CustomerPurchasesResult } from "./customer-purchase-types";
export type { CustomerReportResult } from "./customer-report-types";
export type { CustomerRow, CustomersResult, SellerChoice } from "./customer-types";
export type { SmallInCap, SmallInFilters, SmallInResult } from "./small-in-types";
export type { SalesProfitResult } from "./sales-profit-types";
export type { StockProduct, StockResult } from "./stock-types";
export type { StockTransformsResult } from "./transform-types";
export type { TradeDayPoint, TradeFilters, TradeLine, TradeLinesResult, TradeMonthPoint, TradePivotRow, TradeSide, TradeSummary } from "./trade-types";
export type { YearCompareResult } from "./year-compare-types";

/** Contaminant kg from `wastes` JSON — object `{weight}` or array of those. */
export const ITEM_WASTE_WEIGHT = `CASE
  WHEN i.wastes IS NULL THEN 0
  WHEN jsonb_typeof(i.wastes) = 'array' THEN COALESCE((
    SELECT SUM(COALESCE(NULLIF(e->>'weight','')::numeric, 0))
    FROM jsonb_array_elements(i.wastes) e
  ), 0)
  WHEN jsonb_typeof(i.wastes) = 'object' THEN COALESCE(NULLIF(i.wastes->>'weight','')::numeric, 0)
  ELSE 0
END`;

/** Scrapee payable warehouse weight: gross minus tare (`deduct`) minus contaminant (`wastes`). */
export const ITEM_NET_WEIGHT = `GREATEST(COALESCE(i.weight,0) - COALESCE(i.deduct,0) - (${ITEM_WASTE_WEIGHT}), 0)`;
const OUT_BUYER_PARTY_SQL = `COALESCE(NULLIF(t.buyer_id, ''), 'n:' || COALESCE(t.buyer_fullname, ''))`;

export function wasteWeight(wastes: unknown): number {
  if (wastes == null || wastes === "") return 0;
  if (typeof wastes === "string") {
    try {
      return wasteWeight(JSON.parse(wastes));
    } catch {
      return 0;
    }
  }
  if (Array.isArray(wastes)) {
    return wastes.reduce((sum, entry) => sum + wasteWeight(entry), 0);
  }
  if (typeof wastes === "object") {
    return num((wastes as { weight?: unknown }).weight);
  }
  return 0;
}

export function netWarehouseWeight(weight: unknown, deduct: unknown, wastes?: unknown): number {
  return Math.max(num(weight) - num(deduct) - wasteWeight(wastes), 0);
}

const STALE_SYNC_MINUTES = 45;

export async function getSyncStatus(): Promise<SyncStatus> {
  const pool = getPool();
  const [latest, active] = await Promise.all([
    pool.query<{
      finished_at: Date | null;
      started_at: Date | null;
      mode: string | null;
      error: string | null;
    }>(`SELECT finished_at, started_at, mode, error FROM sync_runs ORDER BY id DESC LIMIT 1`),
    pool.query<{ id: string }>(
      `SELECT id FROM sync_runs
       WHERE finished_at IS NULL
         AND started_at > now() - ($1::int * interval '1 minute')
       ORDER BY id DESC LIMIT 1`,
      [STALE_SYNC_MINUTES]
    ),
  ]);
  const row = latest.rows[0];
  return {
    finishedAt: row?.finished_at ? row.finished_at.toISOString() : null,
    startedAt: row?.started_at ? row.started_at.toISOString() : null,
    mode: row?.mode ?? null,
    error: row?.error ?? null,
    running: active.rows.length > 0,
  };
}

export async function getStock(
  filters?: { branch?: string | null; itemGroup?: string | null; range?: DateRange } | null
): Promise<StockResult> {
  const pool = getPool();
  const range =
    filters?.range ?? rangeFromPreset("custom", sqlDay(new Date()), sqlDay(new Date()));
  const from = range.from;
  const to = range.from >= range.to ? new Date(range.from.getTime() + 24 * 60 * 60 * 1000) : range.to;
  const params: unknown[] = [from, to];
  let where = "WHERE COALESCE(s.stock_qty, 0) > 0";
  const kpiParams: unknown[] = [];
  let kpiWhere = "WHERE COALESCE(s.stock_qty, 0) > 0";
  if (filters?.branch) {
    params.push(filters.branch);
    where += ` AND s.branch_code = $${params.length}`;
    kpiParams.push(filters.branch);
    kpiWhere += ` AND s.branch_code = $${kpiParams.length}`;
  }
  if (filters?.itemGroup) {
    params.push(filters.itemGroup);
    where += ` AND s.item_group = $${params.length}`;
    kpiParams.push(filters.itemGroup);
    kpiWhere += ` AND s.item_group = $${kpiParams.length}`;
  }

  const buyJoin = `LEFT JOIN (
         SELECT i.product_id,
                i.branch_code,
                SUM(${ITEM_NET_WEIGHT} * COALESCE(i.paid_price, 0))::float AS buy_amount,
                SUM(${ITEM_NET_WEIGHT})::float AS buy_weight
         FROM in_ticket_items i
         JOIN in_tickets t ON t.id = i.ticket_id
         WHERE t.is_deleted = FALSE AND t.status = 'paid' AND t.paid_timestamp IS NOT NULL
           AND t.paid_timestamp >= $1 AND t.paid_timestamp < $2
         GROUP BY i.product_id, i.branch_code
       ) a ON a.product_id = s.id AND a.branch_code IS NOT DISTINCT FROM s.branch_code`;

  const [rowsQ, kpiQ, optionQ] = await Promise.all([
    pool.query<{
      id: string;
      code: string | null;
      name: string | null;
      branch_code: string | null;
      item_group: string | null;
      unit: string | null;
      stock_qty: number;
      weight_kg: number;
      base_price: number;
      estimated_value: number;
      buy_amount: number | null;
      buy_weight: number | null;
      avg_paid_price: number | null;
    }>(
      `SELECT s.id, s.code, s.name, s.branch_code, s.item_group, s.unit,
              COALESCE(s.stock_qty,0)::float AS stock_qty,
              COALESCE(s.weight_kg,0)::float AS weight_kg,
              COALESCE(s.base_price,0)::float AS base_price,
              COALESCE(s.estimated_value,0)::float AS estimated_value,
              COALESCE(a.buy_amount,0)::float AS buy_amount,
              COALESCE(a.buy_weight,0)::float AS buy_weight,
              CASE WHEN COALESCE(a.buy_weight,0) > 0 THEN (a.buy_amount / a.buy_weight)::float ELSE NULL END AS avg_paid_price
       FROM v_stock_snapshot s
       ${buyJoin}
       ${where}
       ORDER BY s.branch_code NULLS LAST, s.item_group NULLS LAST, s.estimated_value DESC, s.code NULLS LAST`,
      params
    ),
    pool.query<{ products: number; qty: number; weight_kg: number; value: number }>(
      `SELECT COUNT(*)::int AS products,
              COALESCE(SUM(s.stock_qty),0)::float AS qty,
              COALESCE(SUM(s.weight_kg),0)::float AS weight_kg,
              COALESCE(SUM(s.estimated_value),0)::float AS value
       FROM v_stock_snapshot s
       ${kpiWhere}`,
      kpiParams
    ),
    pool.query<{ branch_code: string | null; item_group: string | null }>(
      `SELECT DISTINCT branch_code, item_group
       FROM v_stock_snapshot
       WHERE COALESCE(stock_qty, 0) > 0`
    ),
  ]);

  const rows: StockProduct[] = rowsQ.rows.map((row) => {
    const buyAmount = num(row.buy_amount);
    const buyWeight = num(row.buy_weight);
    return {
      id: String(row.id),
      code: row.code,
      name: row.name,
      branchCode: row.branch_code,
      itemGroup: row.item_group,
      unit: row.unit,
      stockQty: num(row.stock_qty),
      weightKg: num(row.weight_kg),
      basePrice: num(row.base_price),
      estimatedValue: num(row.estimated_value),
      buyAmount,
      buyWeight,
      avgPaidPrice: buyWeight > 0 ? buyAmount / buyWeight : null,
    };
  });

  const branches = [...new Set(optionQ.rows.map((row) => row.branch_code).filter((v): v is string => Boolean(v)))].sort(
    (a, b) => a.localeCompare(b, "th", { numeric: true })
  );
  const itemGroups = [...new Set(optionQ.rows.map((row) => row.item_group).filter((v): v is string => Boolean(v)))].sort(
    (a, b) => a.localeCompare(b, "th", { numeric: true })
  );

  return {
    note: "สต็อกเป็น snapshot ตอน sync · คงเหลือ (กก.) = คงเหลือ × COALESCE(kg_conversion, 1) · มูลค่า = คงเหลือ × ราคาตั้งต้น · ราคาถัวเฉลี่ยจากตั๋วซื้อจ่ายแล้วในช่วงวันที่ ไม่ใช่ต้นทุนของของคงเหลือ และไม่ใช่กำไรสุทธิ",
    from: sqlDay(from),
    to: sqlDay(new Date(to.getTime() - 1)),
    productCount: num(kpiQ.rows[0]?.products),
    stockQty: num(kpiQ.rows[0]?.qty),
    weightKg: num(kpiQ.rows[0]?.weight_kg),
    estimatedValue: num(kpiQ.rows[0]?.value),
    branches,
    itemGroups,
    rows,
  };
}

const SELLER_NAME_GROUP_SQL = `COALESCE(NULLIF(TRIM(substring(COALESCE(p.fullname, '') from '\\(([^()]+)\\)\\s*$')), ''), 'ไม่ระบุ')`;

export async function getCustomers(opts: {
  ceYear: number;
  group?: string | null;
  query?: string | null;
  silentDays?: number | "never" | null;
  page?: number | null;
  all?: boolean;
}): Promise<CustomersResult> {
  const range = ceYearRange(opts.ceYear);
  const pool = getPool();
  const pageSize = 1000;
  const params: unknown[] = [range.from, range.to];
  let extraBase = "";
  if (opts.group === "__none__" || opts.group === "ไม่ระบุ") {
    extraBase += ` AND ${SELLER_NAME_GROUP_SQL} = 'ไม่ระบุ'`;
  } else if (opts.group) {
    params.push(opts.group);
    extraBase += ` AND ${SELLER_NAME_GROUP_SQL} = $${params.length}`;
  }
  if (opts.query && opts.query.trim()) {
    params.push(`%${opts.query.trim()}%`);
    extraBase += ` AND (p.fullname ILIKE $${params.length} OR COALESCE(p.code, '') ILIKE $${params.length} OR COALESCE(p.tel, '') ILIKE $${params.length})`;
  }
  let extraSilent = "";
  if (opts.silentDays === "never") {
    extraSilent += ` AND v.last_paid IS NULL`;
  } else if (opts.silentDays != null && opts.silentDays > 0) {
    extraSilent += ` AND (v.last_paid IS NULL OR v.silent_days >= ${Math.trunc(opts.silentDays)})`;
  }

  const fromBody = `
    FROM (
      SELECT DISTINCT ON (id) id, code, fullname, tel
      FROM (
        SELECT id, code, fullname, tel, 0 AS pri FROM sellers
        UNION ALL
        SELECT seller_id, seller_code, seller_fullname, NULLIF(seller_snapshot->>'tel', ''), 1
        FROM in_tickets
        WHERE seller_id IS NOT NULL AND is_deleted = FALSE
      ) src
      ORDER BY id, pri
    ) p
    LEFT JOIN (
      SELECT seller_id,
             MAX(paid_timestamp) AS last_paid,
             ((now() AT TIME ZONE 'Asia/Bangkok')::date
               - (MAX(paid_timestamp) AT TIME ZONE 'Asia/Bangkok')::date) AS silent_days
      FROM in_tickets
      WHERE is_deleted = FALSE AND status = 'paid' AND paid_timestamp IS NOT NULL
      GROUP BY seller_id
    ) v ON v.seller_id = p.id
    LEFT JOIN (
      SELECT t.seller_id,
             COUNT(DISTINCT t.id)::int AS tickets,
             COALESCE(SUM(${ITEM_NET_WEIGHT} * COALESCE(pr.kg_conversion,1)),0)::float AS weight_kg,
             COALESCE(SUM(${ITEM_NET_WEIGHT} * COALESCE(i.paid_price,0)),0)::float AS amount
      FROM in_tickets t
      JOIN in_ticket_items i ON i.ticket_id = t.id
      LEFT JOIN products pr ON pr.id = i.product_id
      WHERE t.is_deleted = FALSE AND t.status = 'paid'
        AND t.paid_timestamp >= $1 AND t.paid_timestamp < $2
        AND t.seller_id IS NOT NULL
      GROUP BY t.seller_id
    ) y ON y.seller_id = p.id
    WHERE 1=1`;
  const fromBase = `${fromBody} ${extraBase}`;
  const fromFiltered = `${fromBody} ${extraBase}${extraSilent}`;

  const groupExpr = `COALESCE(NULLIF(TRIM(substring(COALESCE(fullname, '') from '\\(([^()]+)\\)\\s*$')), ''), 'ไม่ระบุ')`;
  const silentSelect = CUSTOMER_SILENT_BUCKETS.map(
    (n) => `COUNT(*) FILTER (WHERE v.last_paid IS NULL OR v.silent_days >= ${n})::int AS s${n}`
  ).join(",\n              ");

  const [countQ, bucketQ, years, groupQ] = await Promise.all([
    pool.query<{ total: number }>(`SELECT COUNT(*)::int AS total ${fromFiltered}`, params),
    pool.query<Record<string, number>>(
      `SELECT COUNT(*) FILTER (WHERE v.last_paid IS NULL)::int AS never_sold,
              ${silentSelect}
       ${fromBase}`,
      params
    ),
    getAvailableBeYears(),
    pool.query<{ group_name: string }>(
      `SELECT DISTINCT ${groupExpr} AS group_name
       FROM (
         SELECT fullname FROM sellers
         UNION ALL
         SELECT seller_fullname FROM in_tickets WHERE seller_fullname IS NOT NULL
       ) n
       ORDER BY 1`
    ),
  ]);

  const total = num(countQ.rows[0]?.total);
  const pageCount = Math.max(1, Math.ceil(total / pageSize) || 1);
  const page = opts.all ? 1 : Math.min(Math.max(1, Math.trunc(opts.page ?? 1)), pageCount);
  const offset = (page - 1) * pageSize;
  const limitSql = opts.all ? "" : ` LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
  const rowParams = opts.all ? params : [...params, pageSize, offset];

  const rowsQ = await pool.query<{
    id: string;
    code: string | null;
    fullname: string | null;
    tel: string | null;
    group_name: string;
    last_paid: Date | null;
    silent_days: number | null;
    tickets: number;
    weight_kg: number;
    amount: number;
  }>(
    `SELECT p.id, p.code, p.fullname, p.tel,
            ${SELLER_NAME_GROUP_SQL} AS group_name,
            v.last_paid,
            v.silent_days,
            COALESCE(y.tickets,0)::int AS tickets,
            COALESCE(y.weight_kg,0)::float AS weight_kg,
            COALESCE(y.amount,0)::float AS amount
     ${fromFiltered}
     ORDER BY (v.last_paid IS NULL) DESC, v.silent_days DESC NULLS LAST, p.fullname NULLS LAST
     ${limitSql}`,
    rowParams
  );

  const rows: CustomerRow[] = rowsQ.rows.map((row) => ({
    sellerId: String(row.id),
    code: row.code,
    name: row.fullname,
    tel: row.tel,
    group: row.group_name,
    lastPaidAt: row.last_paid ? new Date(row.last_paid).toISOString() : null,
    silentDays: row.silent_days == null ? null : num(row.silent_days),
    neverSold: row.last_paid == null,
    tickets: num(row.tickets),
    weightKg: num(row.weight_kg),
    amount: num(row.amount),
  }));

  const bucketRow = bucketQ.rows[0] ?? {};
  const silentCounts = {
    30: num(bucketRow.s30),
    60: num(bucketRow.s60),
    90: num(bucketRow.s90),
    180: num(bucketRow.s180),
    365: num(bucketRow.s365),
  };

  return {
    note: "กลุ่มลูกค้า = วงเล็บท้ายชื่อ เช่น (A123) · วันหายนับจากวันจ่ายล่าสุดทั้งประวัติ · ปริมาณ/ยอดเป็นปีที่เลือกจากรายการจ่ายแล้ว ไม่ใช่กำไรสุทธิ",
    ceYear: opts.ceYear,
    beYear: toBuddhistYear(opts.ceYear),
    customerCount: total,
    silent90: silentCounts[90],
    neverSold: num(bucketRow.never_sold),
    silentCounts,
    weightKg: rows.reduce((s, row) => s + row.weightKg, 0),
    amount: rows.reduce((s, row) => s + row.amount, 0),
    page,
    pageSize: opts.all ? Math.max(total, 1) : pageSize,
    total,
    groups: groupQ.rows.map((row) => row.group_name).sort((a, b) => a.localeCompare(b, "th", { numeric: true })),
    availableBeYears: years.length ? years : [toBuddhistYear(opts.ceYear)],
    rows,
  };
}

function monthStartUtc(year: number, month: number): Date {
  return bangkokDayStart(year, month, 1);
}

function shiftMonth(year: number, month: number, delta: number): { year: number; month: number } {
  const idx = year * 12 + (month - 1) + delta;
  return { year: Math.floor(idx / 12), month: (idx % 12) + 1 };
}

function reportKpi(current: number, previous: number): { current: number; previous: number; changePct: number | null } {
  return {
    current,
    previous,
    changePct: previous > 0 ? ((current - previous) / previous) * 100 : null,
  };
}

function classifyMonth(
  month: string,
  prevMonth: string,
  active: Map<string, Set<string>>,
  firstMonth: Map<string, string>
): {
  newIds: string[];
  lostIds: string[];
  retainedIds: string[];
  returnedIds: string[];
  newCount: number;
  lostCount: number;
  retainedCount: number;
  returnedCount: number;
  returningCount: number;
} {
  const cur = active.get(month) ?? new Set<string>();
  const prev = active.get(prevMonth) ?? new Set<string>();
  const newIds: string[] = [];
  const retainedIds: string[] = [];
  const returnedIds: string[] = [];
  const lostIds: string[] = [];
  for (const id of cur) {
    if ((firstMonth.get(id) ?? month) === month) newIds.push(id);
    else if (prev.has(id)) retainedIds.push(id);
    else returnedIds.push(id);
  }
  for (const id of prev) {
    if (!cur.has(id)) lostIds.push(id);
  }
  return {
    newIds,
    lostIds,
    retainedIds,
    returnedIds,
    newCount: newIds.length,
    lostCount: lostIds.length,
    retainedCount: retainedIds.length,
    returnedCount: returnedIds.length,
    returningCount: retainedIds.length + returnedIds.length,
  };
}

export async function getCustomerReport(opts: { group?: string | null; ceYear?: number | null }): Promise<CustomerReportResult> {
  const pool = getPool();
  const [nowY, nowM] = sqlDay(new Date()).split("-").map(Number);
  const ceYear = opts.ceYear && opts.ceYear >= 2000 ? Math.trunc(opts.ceYear) : nowY;
  const focusMonth = ceYear === nowY ? nowM : 12;
  const prev = shiftMonth(ceYear, focusMonth, -1);
  const prevStart = monthStartUtc(prev.year, prev.month);
  const kpiNextStart = monthStartUtc(ceYear, focusMonth + 1);
  const activityFromDate = monthStartUtc(ceYear - 1, 12);
  const yearEnd = monthStartUtc(ceYear + 1, 1);
  const seriesMonths = Array.from({ length: 12 }, (_, i) => `${ceYear}-${String(i + 1).padStart(2, "0")}-01`);
  const monthStart = `${ceYear}-${String(focusMonth).padStart(2, "0")}-01`;
  const previousMonthStart = `${prev.year}-${String(prev.month).padStart(2, "0")}-01`;

  const params: unknown[] = [];
  let groupSql = "";
  if (opts.group === "__none__" || opts.group === "ไม่ระบุ") {
    groupSql = ` AND ${SELLER_NAME_GROUP_SQL} = 'ไม่ระบุ'`;
  } else if (opts.group) {
    params.push(opts.group);
    groupSql = ` AND ${SELLER_NAME_GROUP_SQL} = $${params.length}`;
  }

  const parties = `
    SELECT DISTINCT ON (id) id, fullname
    FROM (
      SELECT id, fullname, 0 AS pri FROM sellers
      UNION ALL
      SELECT seller_id, seller_fullname, 1
      FROM in_tickets
      WHERE seller_id IS NOT NULL AND is_deleted = FALSE
    ) src
    ORDER BY id, pri
  `;
  const filtered = `
    SELECT p.id
    FROM (${parties}) p
    WHERE 1=1${groupSql}
  `;

  const firstParams = [...params];
  const monthParams = [...params, activityFromDate, yearEnd];
  const amountParams = [...params, prevStart, kpiNextStart];
  const monthFromIdx = params.length + 1;
  const monthToIdx = params.length + 2;
  const amountFromIdx = params.length + 1;
  const amountToIdx = params.length + 2;

  const [firstQ, monthQ, amountQ, groupQ, years] = await Promise.all([
    pool.query<{ seller_id: string; first_month: string }>(
      `SELECT t.seller_id::text AS seller_id,
              date_trunc('month', MIN(t.paid_timestamp AT TIME ZONE 'Asia/Bangkok'))::date::text AS first_month
       FROM in_tickets t
       JOIN (${filtered}) f ON f.id = t.seller_id
       WHERE t.is_deleted = FALSE AND t.status = 'paid' AND t.paid_timestamp IS NOT NULL
         AND t.seller_id IS NOT NULL
       GROUP BY t.seller_id`,
      firstParams
    ),
    pool.query<{ seller_id: string; m: string }>(
      `SELECT t.seller_id::text AS seller_id,
              date_trunc('month', t.paid_timestamp AT TIME ZONE 'Asia/Bangkok')::date::text AS m
       FROM in_tickets t
       JOIN (${filtered}) f ON f.id = t.seller_id
       WHERE t.is_deleted = FALSE AND t.status = 'paid' AND t.paid_timestamp IS NOT NULL
         AND t.seller_id IS NOT NULL
         AND t.paid_timestamp >= $${monthFromIdx} AND t.paid_timestamp < $${monthToIdx}
       GROUP BY t.seller_id, 2`,
      monthParams
    ),
    pool.query<{ m: string; amount: number }>(
      `SELECT date_trunc('month', t.paid_timestamp AT TIME ZONE 'Asia/Bangkok')::date::text AS m,
              COALESCE(SUM(${ITEM_NET_WEIGHT} * COALESCE(i.paid_price,0)),0)::float AS amount
       FROM in_tickets t
       JOIN (${filtered}) f ON f.id = t.seller_id
       JOIN in_ticket_items i ON i.ticket_id = t.id
       WHERE t.is_deleted = FALSE AND t.status = 'paid' AND t.paid_timestamp IS NOT NULL
         AND t.seller_id IS NOT NULL
         AND t.paid_timestamp >= $${amountFromIdx} AND t.paid_timestamp < $${amountToIdx}
       GROUP BY 1`,
      amountParams
    ),
    pool.query<{ group_name: string }>(
      `SELECT DISTINCT COALESCE(NULLIF(TRIM(substring(COALESCE(fullname, '') from '\\(([^()]+)\\)\\s*$')), ''), 'ไม่ระบุ') AS group_name
       FROM (
         SELECT fullname FROM sellers
         UNION ALL
         SELECT seller_fullname FROM in_tickets WHERE seller_fullname IS NOT NULL
       ) n
       ORDER BY 1`
    ),
    getAvailableBeYears(),
  ]);

  const firstMonth = new Map(firstQ.rows.map((row) => [row.seller_id, row.first_month.slice(0, 10)]));
  const active = new Map<string, Set<string>>();
  for (const row of monthQ.rows) {
    const m = row.m.slice(0, 10);
    let set = active.get(m);
    if (!set) {
      set = new Set();
      active.set(m, set);
    }
    set.add(row.seller_id);
  }
  const amountByMonth = new Map(amountQ.rows.map((row) => [row.m.slice(0, 10), num(row.amount)]));

  const series = seriesMonths.map((month, i) => {
    const prevMonth =
      i === 0
        ? `${ceYear - 1}-12-01`
        : seriesMonths[i - 1]!;
    const c = classifyMonth(month, prevMonth, active, firstMonth);
    return {
      month,
      newCount: c.newCount,
      returningCount: c.returningCount,
    };
  });

  const current = classifyMonth(monthStart, previousMonthStart, active, firstMonth);
  const beforePrev = shiftMonth(prev.year, prev.month, -1);
  const previous = classifyMonth(
    previousMonthStart,
    `${beforePrev.year}-${String(beforePrev.month).padStart(2, "0")}-01`,
    active,
    firstMonth
  );

  const peopleIds = [...new Set([...current.newIds, ...current.lostIds, ...current.retainedIds, ...current.returnedIds])];
  const people = await loadCustomerReportPeople(peopleIds, prevStart, kpiNextStart, monthStart, previousMonthStart);

  function listFor(ids: string[], usePrevMonth: boolean): CustomerReportPerson[] {
    return ids
      .map((id) => {
        const row = people.get(id);
        if (!row) {
          return {
            sellerId: id,
            name: null,
            code: null,
            tel: null,
            group: "ไม่ระบุ",
            lastPaidAt: null,
            tickets: 0,
            amount: 0,
          };
        }
        return {
          sellerId: row.sellerId,
          name: row.name,
          code: row.code,
          tel: row.tel,
          group: row.group,
          lastPaidAt: row.lastPaidAt,
          tickets: usePrevMonth ? row.prevTickets : row.thisTickets,
          amount: usePrevMonth ? row.prevAmount : row.thisAmount,
        };
      })
      .sort((a, b) => (a.name ?? "").localeCompare(b.name ?? "", "th"));
  }

  return {
    ceYear,
    beYear: toBuddhistYear(ceYear),
    availableBeYears: years.length ? years : [toBuddhistYear(ceYear)],
    monthStart,
    previousMonthStart,
    newCustomers: reportKpi(current.newCount, previous.newCount),
    lostCustomers: reportKpi(current.lostCount, previous.lostCount),
    retainedCustomers: reportKpi(current.retainedCount, previous.retainedCount),
    returnedCustomers: reportKpi(current.returnedCount, previous.returnedCount),
    amount: reportKpi(amountByMonth.get(monthStart) ?? 0, amountByMonth.get(previousMonthStart) ?? 0),
    series,
    groups: groupQ.rows.map((row) => row.group_name),
    lists: {
      new: listFor(current.newIds, false),
      lost: listFor(current.lostIds, true),
      retained: listFor(current.retainedIds, false),
      returned: listFor(current.returnedIds, false),
    },
  };
}

type ReportPersonAcc = {
  sellerId: string;
  name: string | null;
  code: string | null;
  tel: string | null;
  group: string;
  lastPaidAt: string | null;
  thisTickets: number;
  thisAmount: number;
  prevTickets: number;
  prevAmount: number;
};

async function loadCustomerReportPeople(
  ids: string[],
  prevStart: Date,
  nextStart: Date,
  monthStart: string,
  previousMonthStart: string
): Promise<Map<string, ReportPersonAcc>> {
  const map = new Map<string, ReportPersonAcc>();
  if (ids.length === 0) return map;
  const rows = await getPool().query<{
    id: string;
    code: string | null;
    fullname: string | null;
    tel: string | null;
    group_name: string;
    last_paid: Date | null;
    month: string | null;
    tickets: number | null;
    amount: number | null;
  }>(
    `WITH parties AS (
       SELECT DISTINCT ON (id) id, code, fullname, tel
       FROM (
         SELECT id, code, fullname, tel, 0 AS pri FROM sellers
         UNION ALL
         SELECT seller_id, seller_code, seller_fullname, NULLIF(seller_snapshot->>'tel', ''), 1
         FROM in_tickets
         WHERE seller_id IS NOT NULL AND is_deleted = FALSE
       ) src
       WHERE id::text = ANY($1::text[])
       ORDER BY id, pri
     ),
     last_paid AS (
       SELECT seller_id::text AS seller_id, MAX(paid_timestamp) AS last_paid
       FROM in_tickets
       WHERE is_deleted = FALSE AND status = 'paid' AND paid_timestamp IS NOT NULL
         AND seller_id::text = ANY($1::text[])
       GROUP BY seller_id
     ),
     month_amt AS (
       SELECT t.seller_id::text AS seller_id,
              date_trunc('month', t.paid_timestamp AT TIME ZONE 'Asia/Bangkok')::date::text AS month,
              COUNT(DISTINCT t.id)::int AS tickets,
              COALESCE(SUM(${ITEM_NET_WEIGHT} * COALESCE(i.paid_price,0)),0)::float AS amount
       FROM in_tickets t
       JOIN in_ticket_items i ON i.ticket_id = t.id
       WHERE t.is_deleted = FALSE AND t.status = 'paid' AND t.paid_timestamp IS NOT NULL
         AND t.seller_id::text = ANY($1::text[])
         AND t.paid_timestamp >= $2 AND t.paid_timestamp < $3
       GROUP BY t.seller_id, 2
     )
     SELECT p.id::text AS id, p.code, p.fullname, p.tel,
            COALESCE(NULLIF(TRIM(substring(COALESCE(p.fullname, '') from '\\(([^()]+)\\)\\s*$')), ''), 'ไม่ระบุ') AS group_name,
            lp.last_paid,
            ma.month,
            ma.tickets,
            ma.amount
     FROM parties p
     LEFT JOIN last_paid lp ON lp.seller_id = p.id
     LEFT JOIN month_amt ma ON ma.seller_id = p.id`,
    [ids, prevStart, nextStart]
  );

  for (const row of rows.rows) {
    const id = String(row.id);
    let cur = map.get(id);
    if (!cur) {
      cur = {
        sellerId: id,
        name: row.fullname,
        code: row.code,
        tel: row.tel,
        group: row.group_name,
        lastPaidAt: row.last_paid ? new Date(row.last_paid).toISOString() : null,
        thisTickets: 0,
        thisAmount: 0,
        prevTickets: 0,
        prevAmount: 0,
      };
      map.set(id, cur);
    }
    const month = row.month?.slice(0, 10) ?? "";
    if (month === monthStart) {
      cur.thisTickets = num(row.tickets);
      cur.thisAmount = num(row.amount);
    } else if (month === previousMonthStart) {
      cur.prevTickets = num(row.tickets);
      cur.prevAmount = num(row.amount);
    }
  }
  return map;
}

function mapSellerChoice(row: { id: string; code: string | null; fullname: string | null; tel: string | null }): SellerChoice {
  return {
    sellerId: String(row.id),
    name: row.fullname,
    code: row.code,
    tel: row.tel,
  };
}

export async function searchSellers(opts: { query?: string | null; id?: string | null }): Promise<SellerChoice[]> {
  const pool = getPool();
  const id = opts.id?.trim() ?? "";
  if (id) {
    const found = await pool.query<{ id: string; code: string | null; fullname: string | null; tel: string | null }>(
      `SELECT id, code, fullname, tel FROM (
         SELECT DISTINCT ON (id) id, code, fullname, tel
         FROM (
           SELECT id, code, fullname, tel, 0 AS pri FROM sellers
           UNION ALL
           SELECT seller_id, seller_code, seller_fullname, NULLIF(seller_snapshot->>'tel', ''), 1
           FROM in_tickets
           WHERE seller_id IS NOT NULL AND is_deleted = FALSE
         ) src
         WHERE id = $1
         ORDER BY id, pri
       ) p`,
      [id]
    );
    return found.rows.map(mapSellerChoice);
  }
  const query = opts.query?.trim() ?? "";
  if (!query) return [];
  const found = await pool.query<{ id: string; code: string | null; fullname: string | null; tel: string | null }>(
    `SELECT id, code, fullname, tel FROM (
       SELECT DISTINCT ON (id) id, code, fullname, tel
       FROM (
         SELECT id, code, fullname, tel, 0 AS pri FROM sellers
         UNION ALL
         SELECT seller_id, seller_code, seller_fullname, NULLIF(seller_snapshot->>'tel', ''), 1
         FROM in_tickets
         WHERE seller_id IS NOT NULL AND is_deleted = FALSE
       ) src
       WHERE COALESCE(fullname, '') ILIKE $1
          OR COALESCE(code, '') ILIKE $1
          OR COALESCE(tel, '') ILIKE $1
       ORDER BY id, pri
     ) p
     ORDER BY fullname NULLS LAST, code NULLS LAST
     LIMIT 20`,
    [`%${query}%`]
  );
  return found.rows.map(mapSellerChoice);
}

export async function searchBuyers(opts: { query?: string | null; id?: string | null }): Promise<SellerChoice[]> {
  const pool = getPool();
  const id = opts.id?.trim() ?? "";
  if (id) {
    const found = await pool.query<{ id: string; code: string | null; fullname: string | null; tel: string | null }>(
      `SELECT ${OUT_BUYER_PARTY_SQL} AS id,
              MAX(NULLIF(t.buyer_snapshot->>'code', '')) AS code,
              MAX(COALESCE(t.buyer_fullname, t.buyer_snapshot->>'fullname', t.buyer_snapshot->>'companyName')) AS fullname,
              MAX(NULLIF(t.buyer_snapshot->>'tel', '')) AS tel
       FROM out_tickets t
       WHERE t.is_deleted = FALSE AND ${OUT_BUYER_PARTY_SQL} = $1
       GROUP BY 1
       LIMIT 1`,
      [id]
    );
    return found.rows.map(mapSellerChoice);
  }
  const query = opts.query?.trim() ?? "";
  if (!query) return [];
  const found = await pool.query<{ id: string; code: string | null; fullname: string | null; tel: string | null }>(
    `SELECT id, code, fullname, tel FROM (
       SELECT DISTINCT ON (${OUT_BUYER_PARTY_SQL})
              ${OUT_BUYER_PARTY_SQL} AS id,
              NULLIF(t.buyer_snapshot->>'code', '') AS code,
              COALESCE(t.buyer_fullname, t.buyer_snapshot->>'fullname', t.buyer_snapshot->>'companyName') AS fullname,
              NULLIF(t.buyer_snapshot->>'tel', '') AS tel
       FROM out_tickets t
       WHERE t.is_deleted = FALSE
         AND (
           COALESCE(t.buyer_fullname, t.buyer_snapshot->>'fullname', t.buyer_snapshot->>'companyName', '') ILIKE $1
           OR COALESCE(t.buyer_snapshot->>'code', '') ILIKE $1
           OR COALESCE(t.buyer_snapshot->>'tel', '') ILIKE $1
         )
       ORDER BY ${OUT_BUYER_PARTY_SQL}, t.paid_at DESC NULLS LAST
     ) p
     ORDER BY fullname NULLS LAST, code NULLS LAST
     LIMIT 20`,
    [`%${query}%`]
  );
  return found.rows.map(mapSellerChoice);
}

function sellerNameGroup(name: string | null): string {
  const match = (name ?? "").match(/\(([^()]+)\)\s*$/);
  const group = match?.[1]?.trim();
  return group && group.length > 0 ? group : "ไม่ระบุ";
}

type PartyMonthRow = {
  party_id: string;
  fullname: string | null;
  code: string | null;
  tel: string | null;
  month: number;
  tickets: number;
  weight_kg: number;
  amount: number;
};

const PARTY_PAGE_SIZE = 1000;

function partyNameGroupSql(expr: string) {
  return `COALESCE(NULLIF(TRIM(substring(COALESCE(${expr}, '') from '\\(([^()]+)\\)\\s*$')), ''), 'ไม่ระบุ')`;
}

function partySearchSql(alias: string, paramIndex: number) {
  return ` AND (
    COALESCE(${alias}.fullname, '') ILIKE $${paramIndex}
    OR COALESCE(${alias}.code, '') ILIKE $${paramIndex}
    OR COALESCE(${alias}.tel, '') ILIKE $${paramIndex}
    OR ${partyNameGroupSql(`${alias}.fullname`)} ILIKE $${paramIndex}
  )`;
}

function foldPartyMonthRows(rows: PartyMonthRow[], orderIds?: string[]): CustomerPurchaseRow[] {
  const map = new Map<string, CustomerPurchaseRow>();
  for (const row of rows) {
    const id = String(row.party_id);
    let entry = map.get(id);
    if (!entry) {
      entry = {
        sellerId: id,
        name: row.fullname,
        code: row.code,
        tel: row.tel,
        group: sellerNameGroup(row.fullname),
        amountMonths: emptyMonths(),
        weightKgMonths: emptyMonths(),
        ticketsMonths: emptyMonths(),
        amountTotal: 0,
        weightKgTotal: 0,
        ticketsTotal: 0,
      };
      map.set(id, entry);
    }
    const idx = num(row.month) - 1;
    if (idx < 0 || idx > 11) continue;
    entry.amountMonths[idx] += num(row.amount);
    entry.weightKgMonths[idx] += num(row.weight_kg);
    entry.ticketsMonths[idx] += num(row.tickets);
    entry.amountTotal += num(row.amount);
    entry.weightKgTotal += num(row.weight_kg);
    entry.ticketsTotal += num(row.tickets);
  }
  const list = [...map.values()];
  if (orderIds?.length) {
    const pos = new Map(orderIds.map((id, i) => [id, i]));
    return list.sort((a, b) => (pos.get(a.sellerId) ?? 9999) - (pos.get(b.sellerId) ?? 9999));
  }
  return list.sort((a, b) => b.amountTotal - a.amountTotal);
}

async function pagePartyIds(
  partyCte: string,
  rangeParams: unknown[],
  query?: string | null,
  pageRaw?: number | null,
  all?: boolean
): Promise<{
  page: number;
  pageSize: number;
  total: number;
  ids: string[];
  tickets: number;
  weightKg: number;
  amount: number;
}> {
  const pool = getPool();
  const params = [...rangeParams];
  let searchSql = "";
  if (query && query.trim()) {
    params.push(`%${query.trim()}%`);
    searchSql = partySearchSql("p", params.length);
  }
  const countQ = await pool.query<{ n: number; tickets: number; weight_kg: number; amount: number }>(
    `${partyCte}
     SELECT COUNT(*)::int AS n,
            COALESCE(SUM(p.tickets),0)::int AS tickets,
            COALESCE(SUM(p.weight_kg),0)::float AS weight_kg,
            COALESCE(SUM(p.amount),0)::float AS amount
     FROM party p
     WHERE 1=1 ${searchSql}`,
    params
  );
  const total = num(countQ.rows[0]?.n);
  const pageCount = Math.max(1, Math.ceil(total / PARTY_PAGE_SIZE) || 1);
  const page = all ? 1 : Math.min(Math.max(1, Math.trunc(pageRaw ?? 1)), pageCount);
  if (total <= 0) {
    return { page: 1, pageSize: all ? 1 : PARTY_PAGE_SIZE, total: 0, ids: [], tickets: 0, weightKg: 0, amount: 0 };
  }
  const limitSql = all ? "" : ` LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
  const idParams = all ? params : [...params, PARTY_PAGE_SIZE, (page - 1) * PARTY_PAGE_SIZE];
  const idQ = await pool.query<{ party_id: string }>(
    `${partyCte}
     SELECT p.party_id::text AS party_id
     FROM party p
     WHERE 1=1 ${searchSql}
     ORDER BY p.amount DESC, p.fullname NULLS LAST
     ${limitSql}`,
    idParams
  );
  return {
    page,
    pageSize: all ? total : PARTY_PAGE_SIZE,
    total,
    ids: idQ.rows.map((row) => String(row.party_id)),
    tickets: num(countQ.rows[0]?.tickets),
    weightKg: num(countQ.rows[0]?.weight_kg),
    amount: num(countQ.rows[0]?.amount),
  };
}

export async function getCustomerPurchases(
  ceYear: number,
  opts?: { page?: number | null; query?: string | null; all?: boolean }
): Promise<CustomerPurchasesResult> {
  const range = ceYearRange(ceYear);
  const pool = getPool();
  const partyCte = `
    WITH party AS (
      SELECT t.seller_id AS party_id,
             COALESCE(s.fullname, MAX(t.seller_fullname)) AS fullname,
             s.code,
             s.tel,
             COUNT(DISTINCT t.id)::int AS tickets,
             COALESCE(SUM(${ITEM_NET_WEIGHT} * COALESCE(pr.kg_conversion,1)),0)::float AS weight_kg,
             COALESCE(SUM(${ITEM_NET_WEIGHT} * COALESCE(i.paid_price,0)),0)::float AS amount
      FROM in_tickets t
      JOIN in_ticket_items i ON i.ticket_id = t.id
      LEFT JOIN products pr ON pr.id = i.product_id
      LEFT JOIN sellers s ON s.id = t.seller_id
      WHERE t.is_deleted = FALSE AND t.status = 'paid'
        AND t.paid_timestamp >= $1 AND t.paid_timestamp < $2
        AND t.seller_id IS NOT NULL
      GROUP BY t.seller_id, s.fullname, s.code, s.tel
    )`;
  const [paged, years] = await Promise.all([
    pagePartyIds(partyCte, [range.from, range.to], opts?.query, opts?.page, opts?.all),
    getAvailableBeYears(),
  ]);
  const monthQ =
    paged.ids.length === 0
      ? { rows: [] as PartyMonthRow[] }
      : await pool.query<PartyMonthRow>(
          `SELECT t.seller_id AS party_id,
                  COALESCE(s.fullname, MAX(t.seller_fullname)) AS fullname,
                  s.code,
                  s.tel,
                  EXTRACT(MONTH FROM (t.paid_timestamp AT TIME ZONE 'Asia/Bangkok'))::int AS month,
                  COUNT(DISTINCT t.id)::int AS tickets,
                  COALESCE(SUM(${ITEM_NET_WEIGHT} * COALESCE(pr.kg_conversion,1)),0)::float AS weight_kg,
                  COALESCE(SUM(${ITEM_NET_WEIGHT} * COALESCE(i.paid_price,0)),0)::float AS amount
           FROM in_tickets t
           JOIN in_ticket_items i ON i.ticket_id = t.id
           LEFT JOIN products pr ON pr.id = i.product_id
           LEFT JOIN sellers s ON s.id = t.seller_id
           WHERE t.is_deleted = FALSE AND t.status = 'paid'
             AND t.paid_timestamp >= $1 AND t.paid_timestamp < $2
             AND t.seller_id::text = ANY($3::text[])
           GROUP BY t.seller_id, s.fullname, s.code, s.tel, month`,
          [range.from, range.to, paged.ids]
        );
  const rows = foldPartyMonthRows(monthQ.rows, paged.ids);

  return {
    note: "สรุปซื้อเข้าต่อลูกค้าจากรายการจ่ายแล้ว · น้ำหนักสุทธิ × kg_conversion / ราคาจ่าย · ไม่ใช่กำไรสุทธิ",
    ceYear,
    beYear: toBuddhistYear(ceYear),
    customerCount: paged.total,
    tickets: paged.tickets,
    weightKg: paged.weightKg,
    amount: paged.amount,
    page: paged.page,
    pageSize: paged.pageSize,
    total: paged.total,
    availableBeYears: years.length ? years : [toBuddhistYear(ceYear)],
    rows,
  };
}

export async function getCustomerSales(
  ceYear: number,
  opts?: { page?: number | null; query?: string | null; all?: boolean }
): Promise<CustomerPurchasesResult> {
  const range = ceYearRange(ceYear);
  const pool = getPool();
  const partyCte = `
    WITH party AS (
      SELECT ${OUT_BUYER_PARTY_SQL} AS party_id,
             MAX(COALESCE(t.buyer_fullname, t.buyer_snapshot->>'fullname', t.buyer_snapshot->>'companyName')) AS fullname,
             MAX(NULLIF(t.buyer_snapshot->>'code', '')) AS code,
             MAX(NULLIF(t.buyer_snapshot->>'tel', '')) AS tel,
             COUNT(DISTINCT t.id)::int AS tickets,
             COALESCE(SUM(${ITEM_NET_WEIGHT} * COALESCE(pr.kg_conversion,1)),0)::float AS weight_kg,
             COALESCE(SUM(${ITEM_NET_WEIGHT} * COALESCE(i.paid_price,0)),0)::float AS amount
      FROM out_tickets t
      JOIN out_ticket_items i ON i.ticket_id = t.id
      LEFT JOIN products pr ON pr.id = i.product_id
      WHERE t.is_deleted = FALSE AND t.status = 'paid'
        AND t.paid_at >= $1 AND t.paid_at < $2
      GROUP BY 1
    )`;
  const [paged, years] = await Promise.all([
    pagePartyIds(partyCte, [range.from, range.to], opts?.query, opts?.page, opts?.all),
    getAvailableBeYears(),
  ]);
  const monthQ =
    paged.ids.length === 0
      ? { rows: [] as PartyMonthRow[] }
      : await pool.query<PartyMonthRow>(
          `SELECT ${OUT_BUYER_PARTY_SQL} AS party_id,
                  MAX(COALESCE(t.buyer_fullname, t.buyer_snapshot->>'fullname', t.buyer_snapshot->>'companyName')) AS fullname,
                  MAX(NULLIF(t.buyer_snapshot->>'code', '')) AS code,
                  MAX(NULLIF(t.buyer_snapshot->>'tel', '')) AS tel,
                  EXTRACT(MONTH FROM (t.paid_at AT TIME ZONE 'Asia/Bangkok'))::int AS month,
                  COUNT(DISTINCT t.id)::int AS tickets,
                  COALESCE(SUM(${ITEM_NET_WEIGHT} * COALESCE(pr.kg_conversion,1)),0)::float AS weight_kg,
                  COALESCE(SUM(${ITEM_NET_WEIGHT} * COALESCE(i.paid_price,0)),0)::float AS amount
           FROM out_tickets t
           JOIN out_ticket_items i ON i.ticket_id = t.id
           LEFT JOIN products pr ON pr.id = i.product_id
           WHERE t.is_deleted = FALSE AND t.status = 'paid'
             AND t.paid_at >= $1 AND t.paid_at < $2
             AND ${OUT_BUYER_PARTY_SQL} = ANY($3::text[])
           GROUP BY 1, month`,
          [range.from, range.to, paged.ids]
        );
  const rows = foldPartyMonthRows(monthQ.rows, paged.ids);

  return {
    note: "สรุปขายออกต่อผู้ซื้อจากรายการจ่ายแล้ว · ชื่อจาก snapshot บนตั๋ว ไม่มี master ผู้ซื้อ · น้ำหนักสุทธิ × kg_conversion / ราคาจ่าย · ไม่ใช่กำไรสุทธิ",
    ceYear,
    beYear: toBuddhistYear(ceYear),
    customerCount: paged.total,
    tickets: paged.tickets,
    weightKg: paged.weightKg,
    amount: paged.amount,
    page: paged.page,
    pageSize: paged.pageSize,
    total: paged.total,
    availableBeYears: years.length ? years : [toBuddhistYear(ceYear)],
    rows,
  };
}

function openTicketScopeSql(
  startIndex: number,
  itemsTable: "in_ticket_items" | "out_ticket_items",
  filters?: { branch?: string | null; itemGroup?: string | null } | null
): { sql: string; params: string[] } {
  const params: string[] = [];
  let sql = "";
  if (filters?.branch) {
    params.push(filters.branch);
    sql += ` AND EXISTS (SELECT 1 FROM ${itemsTable} i WHERE i.ticket_id = t.id AND i.branch_code = $${startIndex + params.length - 1})`;
  }
  if (filters?.itemGroup) {
    params.push(filters.itemGroup);
    sql += ` AND EXISTS (SELECT 1 FROM ${itemsTable} i WHERE i.ticket_id = t.id AND i.item_group = $${startIndex + params.length - 1})`;
  }
  return { sql, params };
}

export async function getOpenTickets(opts?: {
  side?: "in" | "out" | "all" | null;
  branch?: string | null;
  itemGroup?: string | null;
  all?: boolean;
}): Promise<OpenTicketsResult> {
  const pool = getPool();
  const side = opts?.side === "in" || opts?.side === "out" ? opts.side : "all";
  const inScope = openTicketScopeSql(1, "in_ticket_items", opts);
  const outScope = openTicketScopeSql(1, "out_ticket_items", opts);
  const wantIn = side !== "out";
  const wantOut = side !== "in";

  const inSelect = `SELECT t.id, t.running_number, t.number, t.status, t.recorded_by_name,
            t.seller_fullname AS counterparty, t.net, t.pure_weight, t.created_at, t.age_hours,
            ARRAY(SELECT DISTINCT i.branch_code FROM in_ticket_items i
                  WHERE i.ticket_id = t.id AND i.branch_code IS NOT NULL) AS branches,
            ARRAY(SELECT DISTINCT i.item_group FROM in_ticket_items i
                  WHERE i.ticket_id = t.id AND i.item_group IS NOT NULL) AS item_groups
     FROM v_open_in_tickets t
     WHERE 1=1 ${inScope.sql}
     ORDER BY t.age_hours DESC NULLS LAST
     ${opts?.all ? "" : "LIMIT 1000"}`;
  const outSelect = `SELECT t.id, t.number, t.status, t.recorded_by_name,
            t.buyer_fullname AS counterparty, t.net, t.pure_weight, t.created_at, t.age_hours,
            ARRAY(SELECT DISTINCT i.branch_code FROM out_ticket_items i
                  WHERE i.ticket_id = t.id AND i.branch_code IS NOT NULL) AS branches,
            ARRAY(SELECT DISTINCT i.item_group FROM out_ticket_items i
                  WHERE i.ticket_id = t.id AND i.item_group IS NOT NULL) AS item_groups
     FROM v_open_out_tickets t
     WHERE 1=1 ${outScope.sql}
     ORDER BY t.age_hours DESC NULLS LAST
     ${opts?.all ? "" : "LIMIT 1000"}`;

  const [inRows, outRows, inCount, outCount, optionQ] = await Promise.all([
    wantIn
      ? pool.query(inSelect, inScope.params)
      : Promise.resolve({ rows: [] as Array<Record<string, unknown>> }),
    wantOut
      ? pool.query(outSelect, outScope.params)
      : Promise.resolve({ rows: [] as Array<Record<string, unknown>> }),
    wantIn
      ? pool.query<{ n: number; over24: number }>(
          `SELECT COUNT(*)::int AS n,
                  COUNT(*) FILTER (WHERE t.age_hours >= 24)::int AS over24
           FROM v_open_in_tickets t WHERE 1=1 ${inScope.sql}`,
          inScope.params
        )
      : Promise.resolve({ rows: [{ n: 0, over24: 0 }] }),
    wantOut
      ? pool.query<{ n: number; over24: number }>(
          `SELECT COUNT(*)::int AS n,
                  COUNT(*) FILTER (WHERE t.age_hours >= 24)::int AS over24
           FROM v_open_out_tickets t WHERE 1=1 ${outScope.sql}`,
          outScope.params
        )
      : Promise.resolve({ rows: [{ n: 0, over24: 0 }] }),
    pool.query<{ branch_code: string | null; item_group: string | null }>(
      `SELECT DISTINCT i.branch_code, i.item_group
       FROM in_ticket_items i
       JOIN v_open_in_tickets t ON t.id = i.ticket_id
       UNION
       SELECT DISTINCT i.branch_code, i.item_group
       FROM out_ticket_items i
       JOIN v_open_out_tickets t ON t.id = i.ticket_id`
    ),
  ]);

  const mapRow = (side: "in" | "out", row: Record<string, unknown>): OpenTicketRow => ({
    side,
    id: String(row.id),
    runningNumber: side === "in" ? ((row.running_number as string | null) ?? null) : null,
    number: row.number == null ? null : num(row.number),
    status: (row.status as string | null) ?? null,
    recordedByName: (row.recorded_by_name as string | null) ?? null,
    counterparty: (row.counterparty as string | null) ?? null,
    net: num(row.net),
    weight: num(row.pure_weight),
    createdAt: row.created_at ? new Date(row.created_at as string | Date).toISOString() : null,
    ageHours: num(row.age_hours),
    branches: Array.isArray(row.branches) ? (row.branches as string[]).filter(Boolean) : [],
    itemGroups: Array.isArray(row.item_groups) ? (row.item_groups as string[]).filter(Boolean) : [],
  });

  const rows = [
    ...inRows.rows.map((row) => mapRow("in", row as Record<string, unknown>)),
    ...outRows.rows.map((row) => mapRow("out", row as Record<string, unknown>)),
  ].sort((a, b) => b.ageHours - a.ageHours);

  const branches = [...new Set(optionQ.rows.map((row) => row.branch_code).filter((v): v is string => Boolean(v)))].sort(
    (a, b) => a.localeCompare(b, "th", { numeric: true })
  );
  const itemGroups = [...new Set(optionQ.rows.map((row) => row.item_group).filter((v): v is string => Boolean(v)))].sort(
    (a, b) => a.localeCompare(b, "th", { numeric: true })
  );

  return {
    note: "ซื้อค้าง = draft หรือยังไม่จ่ายและไม่ void · ขายค้าง = draft / shipping / accepted · ไม่ใช้ done=false",
    openIn: num(inCount.rows[0]?.n),
    openOut: num(outCount.rows[0]?.n),
    over24: num(inCount.rows[0]?.over24) + num(outCount.rows[0]?.over24),
    branches,
    itemGroups,
    rows,
  };
}

export async function getInTicket(id: string) {
  const pool = getPool();
  const header = await pool.query(
    `SELECT t.*, e.display_name AS recorded_by_name, p.display_name AS paid_by_name
     FROM in_tickets t
     LEFT JOIN employees e ON e.id = t.recorded_by
     LEFT JOIN employees p ON p.id = t.paid_by
     WHERE t.id = $1`,
    [id]
  );
  if (!header.rows[0]) return null;
  const items = await pool.query(
    `SELECT * FROM in_ticket_items WHERE ticket_id = $1 ORDER BY local_timestamp NULLS LAST`,
    [id]
  );
  return { header: header.rows[0], items: items.rows };
}

export async function getOutTicket(id: string) {
  const pool = getPool();
  const header = await pool.query(
    `SELECT t.*, e.display_name AS recorded_by_name
     FROM out_tickets t
     LEFT JOIN employees e ON e.id = t.recorded_by
     WHERE t.id = $1`,
    [id]
  );
  if (!header.rows[0]) return null;
  const items = await pool.query(
    `SELECT * FROM out_ticket_items WHERE ticket_id = $1`,
    [id]
  );
  return { header: header.rows[0], items: items.rows };
}

function normalizeTicketQuery(raw: string): string {
  return raw.trim();
}

function mapLookupItems(rows: Array<Record<string, unknown>>): LookupTicketItem[] {
  return rows.map((row) => ({
    code: (row.code as string | null) ?? null,
    name: (row.name as string | null) ?? null,
    branchCode: (row.branch_code as string | null) ?? null,
    itemGroup: (row.item_group as string | null) ?? null,
    weight: netWarehouseWeight(row.weight, row.deduct, row.wastes),
    paidPrice: num(row.paid_price),
  }));
}

export async function lookupTicketsByNumber(rawQuery: string): Promise<TicketLookupResult> {
  const query = normalizeTicketQuery(rawQuery);
  if (!query) {
    return { query: "", matches: 0, duplicateWarning: null, tickets: [] };
  }

  const pool = getPool();
  const [inHeaders, outHeaders] = await Promise.all([
    pool.query<{
      id: string;
      running_number: string | null;
      number: number | null;
      status: string | null;
      is_deleted: boolean;
      seller_fullname: string | null;
      recorded_by_name: string | null;
      net: unknown;
      pure_weight: unknown;
      paid_timestamp: Date | null;
    }>(
      `SELECT t.id, t.running_number, t.number, t.status, t.is_deleted,
              t.seller_fullname, e.display_name AS recorded_by_name,
              t.net, t.pure_weight, t.paid_timestamp
       FROM in_tickets t
       LEFT JOIN employees e ON e.id = t.recorded_by
       WHERE t.running_number = $1 OR t.number::text = $1
       ORDER BY t.paid_timestamp DESC NULLS LAST, t.created_at DESC NULLS LAST`,
      [query]
    ),
    pool.query<{
      id: string;
      number: number | null;
      status: string | null;
      is_deleted: boolean;
      buyer_fullname: string | null;
      recorded_by_name: string | null;
      net: unknown;
      pure_weight: unknown;
      paid_at: Date | null;
    }>(
      `SELECT t.id, t.number, t.status, t.is_deleted,
              t.buyer_fullname, e.display_name AS recorded_by_name,
              t.net, t.pure_weight, t.paid_at
       FROM out_tickets t
       LEFT JOIN employees e ON e.id = t.recorded_by
       WHERE t.number::text = $1
       ORDER BY t.paid_at DESC NULLS LAST, t.created_at DESC NULLS LAST`,
      [query]
    ),
  ]);

  const inIds = [...new Set(inHeaders.rows.map((row) => String(row.id)))];
  const outIds = [...new Set(outHeaders.rows.map((row) => String(row.id)))];
  const warnings: string[] = [];
  if (inIds.length > 1) warnings.push(`เลขนี้ชี้ตั๋วซื้อ ${inIds.length} เอกสาร`);
  if (outIds.length > 1) warnings.push(`เลขนี้ชี้ตั๋วขาย ${outIds.length} เอกสาร`);

  const pickedIn = inHeaders.rows.slice(0, 20);
  const remaining = Math.max(0, 20 - pickedIn.length);
  const pickedOut = outHeaders.rows.slice(0, remaining);

  const itemQueries = [
    ...pickedIn.map((row) =>
      pool.query(`SELECT code, name, branch_code, item_group, weight, deduct, wastes, paid_price
                  FROM in_ticket_items WHERE ticket_id = $1
                  ORDER BY local_timestamp NULLS LAST`, [row.id])
    ),
    ...pickedOut.map((row) =>
      pool.query(`SELECT code, name, branch_code, item_group, weight, deduct, wastes, paid_price
                  FROM out_ticket_items WHERE ticket_id = $1`, [row.id])
    ),
  ];
  const itemResults = itemQueries.length ? await Promise.all(itemQueries) : [];

  const tickets: LookupTicket[] = [
    ...pickedIn.map((row, idx) => ({
      side: "in" as const,
      id: String(row.id),
      runningNumber: row.running_number,
      number: row.number == null ? null : num(row.number),
      status: row.status,
      isDeleted: Boolean(row.is_deleted),
      counterparty: row.seller_fullname,
      recordedByName: row.recorded_by_name,
      net: num(row.net),
      weight: num(row.pure_weight),
      paidAt: row.paid_timestamp ? new Date(row.paid_timestamp).toISOString() : null,
      items: mapLookupItems((itemResults[idx]?.rows ?? []) as Array<Record<string, unknown>>),
    })),
    ...pickedOut.map((row, idx) => ({
      side: "out" as const,
      id: String(row.id),
      runningNumber: null,
      number: row.number == null ? null : num(row.number),
      status: row.status,
      isDeleted: Boolean(row.is_deleted),
      counterparty: row.buyer_fullname,
      recordedByName: row.recorded_by_name,
      net: num(row.net),
      weight: num(row.pure_weight),
      paidAt: row.paid_at ? new Date(row.paid_at).toISOString() : null,
      items: mapLookupItems((itemResults[pickedIn.length + idx]?.rows ?? []) as Array<Record<string, unknown>>),
    })),
  ];

  return {
    query,
    matches: tickets.length,
    duplicateWarning: warnings.length ? warnings.join(" · ") : null,
    tickets,
  };
}

function emptyMonths(): number[] {
  return Array.from({ length: 12 }, () => 0);
}

function buildMonthly(rows: Array<{ month: number; amount: number; weightKg: number; tickets: number; costAmount?: number; salesProfit?: number }>): TradeMonthPoint[] {
  const byMonth = new Map(rows.map((row) => [row.month, row]));
  return Array.from({ length: 12 }, (_, i) => {
    const month = i + 1;
    const row = byMonth.get(month);
    return {
      month,
      amount: row?.amount ?? 0,
      weightKg: row?.weightKg ?? 0,
      tickets: row?.tickets ?? 0,
      costAmount: row?.costAmount,
      salesProfit: row?.salesProfit,
    };
  });
}

function compareNullableCode(a: string | null, b: string | null): number {
  return (a ?? "\uFFFF").localeCompare(b ?? "\uFFFF", "th", { numeric: true });
}

function pivotFromItemMonths(
  rows: Array<{ branchCode: string | null; itemGroup: string | null; month: number; amount: number; weightKg: number }>
): TradePivotRow[] {
  const map = new Map<string, TradePivotRow>();
  for (const row of rows) {
    const key = `${row.branchCode ?? ""}\t${row.itemGroup ?? ""}`;
    let entry = map.get(key);
    if (!entry) {
      entry = {
        branchCode: row.branchCode,
        itemGroup: row.itemGroup,
        amountMonths: emptyMonths(),
        weightKgMonths: emptyMonths(),
        amountTotal: 0,
        weightKgTotal: 0,
      };
      map.set(key, entry);
    }
    const idx = row.month - 1;
    if (idx < 0 || idx > 11) continue;
    entry.amountMonths[idx] += row.amount;
    entry.weightKgMonths[idx] += row.weightKg;
    entry.amountTotal += row.amount;
    entry.weightKgTotal += row.weightKg;
  }
  return [...map.values()].sort((a, b) => {
    const byBranch = compareNullableCode(a.branchCode, b.branchCode);
    if (byBranch !== 0) return byBranch;
    return compareNullableCode(a.itemGroup, b.itemGroup);
  });
}

function itemFilterSql(startIndex: number, filters?: TradeFilters | null, side: "in" | "out" = "in"): { sql: string; params: string[] } {
  const params: string[] = [];
  let sql = "";
  if (filters?.branch) {
    params.push(filters.branch);
    sql += ` AND i.branch_code = $${startIndex + params.length - 1}`;
  }
  if (filters?.itemGroup) {
    params.push(filters.itemGroup);
    sql += ` AND i.item_group = $${startIndex + params.length - 1}`;
  }
  if (side === "in" && filters?.sellerId && filters.sellerId.trim()) {
    params.push(filters.sellerId.trim());
    sql += ` AND t.seller_id = $${startIndex + params.length - 1}`;
  }
  if (side === "out" && filters?.buyerId && filters.buyerId.trim()) {
    params.push(filters.buyerId.trim());
    sql += ` AND ${OUT_BUYER_PARTY_SQL} = $${startIndex + params.length - 1}`;
  }
  return { sql, params };
}

async function getAvailableBeYears(): Promise<number[]> {
  const r = await getPool().query<{ y: number }>(
    `SELECT DISTINCT y FROM (
       SELECT EXTRACT(YEAR FROM (paid_timestamp AT TIME ZONE 'Asia/Bangkok'))::int AS y
       FROM in_tickets
       WHERE is_deleted = FALSE AND status = 'paid' AND paid_timestamp IS NOT NULL
       UNION
       SELECT EXTRACT(YEAR FROM (paid_at AT TIME ZONE 'Asia/Bangkok'))::int
       FROM out_tickets
       WHERE is_deleted = FALSE AND status = 'paid' AND paid_at IS NOT NULL
     ) s
     ORDER BY y DESC`
  );
  return r.rows.map((row) => toBuddhistYear(num(row.y)));
}

async function getTradeConversionNote(side: "in" | "out", range: DateRange): Promise<string> {
  const isIn = side === "in";
  const r = await getPool().query<{ missing: number; lines: number }>(
    isIn
      ? `SELECT
           COUNT(*) FILTER (WHERE p.kg_conversion IS NULL)::int AS missing,
           COUNT(*)::int AS lines
         FROM in_ticket_items i
         JOIN in_tickets t ON t.id = i.ticket_id
         LEFT JOIN products p ON p.id = i.product_id
         WHERE t.is_deleted = FALSE AND t.status = 'paid'
           AND t.paid_timestamp >= $1 AND t.paid_timestamp < $2`
      : `SELECT
           COUNT(*) FILTER (WHERE p.kg_conversion IS NULL)::int AS missing,
           COUNT(*)::int AS lines
         FROM out_ticket_items i
         JOIN out_tickets t ON t.id = i.ticket_id
         LEFT JOIN products p ON p.id = i.product_id
         WHERE t.is_deleted = FALSE AND t.status = 'paid'
           AND t.paid_at >= $1 AND t.paid_at < $2`,
    [range.from, range.to]
  );
  const missing = num(r.rows[0]?.missing);
  const lines = num(r.rows[0]?.lines);
  if (lines === 0) {
    return "น้ำหนัก (กก.) = (น้ำหนัก − หัก − เจือปน) × COALESCE(products.kg_conversion, 1)";
  }
  if (missing > 0) {
    return `น้ำหนัก (กก.) = (น้ำหนัก − หัก − เจือปน) × COALESCE(products.kg_conversion, 1) — ${missing.toLocaleString("th-TH")} จาก ${lines.toLocaleString("th-TH")} รายการไม่มี kg_conversion จึงใช้ตัวคูณ 1`;
  }
  return "น้ำหนัก (กก.) แปลงจากน้ำหนักสุทธิรายการ (รวม − หัก − เจือปน) ด้วย products.kg_conversion";
}

async function getItemTradeSummary(side: "in" | "out", ceYear: number, filters?: TradeFilters | null): Promise<TradeSummary> {
  const range = ceYearRange(ceYear);
  const pool = getPool();
  const paidCol = side === "in" ? "t.paid_timestamp" : "t.paid_at";
  const itemsTable = side === "in" ? "in_ticket_items" : "out_ticket_items";
  const ticketsTable = side === "in" ? "in_tickets" : "out_tickets";
  const extra = itemFilterSql(3, filters, side);
  const dateWhere = `t.is_deleted = FALSE AND t.status = 'paid' AND ${paidCol} >= $1 AND ${paidCol} < $2`;
  const where = `${dateWhere}${extra.sql}`;
  const params: unknown[] = [range.from, range.to, ...extra.params];
  const dateParams: unknown[] = [range.from, range.to];

  const [pivotQ, dailyQ, kpiQ, ticketMonthQ, optionQ, conversionNote, availableBeYears] = await Promise.all([
    pool.query<{ branch_code: string | null; item_group: string | null; month: number; amount: number; weight_kg: number }>(
      `SELECT i.branch_code, i.item_group,
              EXTRACT(MONTH FROM (${paidCol} AT TIME ZONE 'Asia/Bangkok'))::int AS month,
              COALESCE(SUM(${ITEM_NET_WEIGHT} * COALESCE(i.paid_price,0)),0)::float AS amount,
              COALESCE(SUM(${ITEM_NET_WEIGHT} * COALESCE(p.kg_conversion,1)),0)::float AS weight_kg
       FROM ${itemsTable} i
       JOIN ${ticketsTable} t ON t.id = i.ticket_id
       LEFT JOIN products p ON p.id = i.product_id
       WHERE ${where}
       GROUP BY i.branch_code, i.item_group, 3`,
      params
    ),
    pool.query<{ day: string; amount: number; weight_kg: number }>(
      `SELECT (${paidCol} AT TIME ZONE 'Asia/Bangkok')::date::text AS day,
              COALESCE(SUM(${ITEM_NET_WEIGHT} * COALESCE(i.paid_price,0)),0)::float AS amount,
              COALESCE(SUM(${ITEM_NET_WEIGHT} * COALESCE(p.kg_conversion,1)),0)::float AS weight_kg
       FROM ${itemsTable} i
       JOIN ${ticketsTable} t ON t.id = i.ticket_id
       LEFT JOIN products p ON p.id = i.product_id
       WHERE ${where}
       GROUP BY 1
       ORDER BY 1`,
      params
    ),
    pool.query<{ amount: number; weight_kg: number; tickets: number }>(
      `SELECT COALESCE(SUM(${ITEM_NET_WEIGHT} * COALESCE(i.paid_price,0)),0)::float AS amount,
              COALESCE(SUM(${ITEM_NET_WEIGHT} * COALESCE(p.kg_conversion,1)),0)::float AS weight_kg,
              COUNT(DISTINCT i.ticket_id)::int AS tickets
       FROM ${itemsTable} i
       JOIN ${ticketsTable} t ON t.id = i.ticket_id
       LEFT JOIN products p ON p.id = i.product_id
       WHERE ${where}`,
      params
    ),
    pool.query<{ month: number; tickets: number }>(
      `SELECT EXTRACT(MONTH FROM (${paidCol} AT TIME ZONE 'Asia/Bangkok'))::int AS month,
              COUNT(DISTINCT i.ticket_id)::int AS tickets
       FROM ${itemsTable} i
       JOIN ${ticketsTable} t ON t.id = i.ticket_id
       WHERE ${where}
       GROUP BY 1`,
      params
    ),
    pool.query<{ branch_code: string | null; item_group: string | null }>(
      `SELECT DISTINCT i.branch_code, i.item_group
       FROM ${itemsTable} i
       JOIN ${ticketsTable} t ON t.id = i.ticket_id
       WHERE ${dateWhere}`,
      dateParams
    ),
    getTradeConversionNote(side, range),
    getAvailableBeYears(),
  ]);

  const pivot = pivotFromItemMonths(
    pivotQ.rows.map((row) => ({
      branchCode: row.branch_code,
      itemGroup: row.item_group,
      month: num(row.month),
      amount: num(row.amount),
      weightKg: num(row.weight_kg),
    }))
  );

  const monthlyMap = new Map<number, { amount: number; weightKg: number; tickets: number }>();
  for (const row of pivotQ.rows) {
    const month = num(row.month);
    const cur = monthlyMap.get(month) ?? { amount: 0, weightKg: 0, tickets: 0 };
    cur.amount += num(row.amount);
    cur.weightKg += num(row.weight_kg);
    monthlyMap.set(month, cur);
  }
  for (const row of ticketMonthQ.rows) {
    const month = num(row.month);
    const cur = monthlyMap.get(month) ?? { amount: 0, weightKg: 0, tickets: 0 };
    cur.tickets = num(row.tickets);
    monthlyMap.set(month, cur);
  }

  const amount = num(kpiQ.rows[0]?.amount);
  const weightKg = num(kpiQ.rows[0]?.weight_kg);
  const tickets = num(kpiQ.rows[0]?.tickets);
  const grainNote =
    "ตั๋วอาจมีหลายรหัสสาขา — ตัวเลขนับจากรายการ ไม่ใช่เจ้าของตั๋ว";

  const branches = [...new Set(optionQ.rows.map((row) => row.branch_code).filter((v): v is string => Boolean(v)))].sort(
    (a, b) => a.localeCompare(b, "th", { numeric: true })
  );
  const itemGroups = [...new Set(optionQ.rows.map((row) => row.item_group).filter((v): v is string => Boolean(v)))].sort(
    (a, b) => a.localeCompare(b, "th", { numeric: true })
  );

  return {
    side,
    ceYear,
    beYear: toBuddhistYear(ceYear),
    grain: "item",
    note: `${grainNote} · ${conversionNote}`,
    kpis: {
      amount,
      weightKg,
      tickets,
      costAmount: null,
      salesProfit: null,
      avgPerKg: weightKg > 0 ? amount / weightKg : 0,
    },
    monthly: buildMonthly(
      [...monthlyMap.entries()].map(([month, row]) => ({ month, ...row }))
    ),
    daily: dailyQ.rows.map((row) => ({
      day: String(row.day),
      amount: num(row.amount),
      weightKg: num(row.weight_kg),
    })),
    pivot,
    availableBeYears: availableBeYears.length ? availableBeYears : [toBuddhistYear(ceYear)],
    branches,
    itemGroups,
  };
}

function subtractMonths(sales: number[], buy: number[]): number[] {
  return sales.map((n, i) => n - (buy[i] ?? 0));
}

function subtractPivot(sales: TradePivotRow[], buy: TradePivotRow[]): TradePivotRow[] {
  const map = new Map<string, TradePivotRow>();
  const keyOf = (row: TradePivotRow) => `${row.branchCode ?? ""}\t${row.itemGroup ?? ""}`;
  for (const row of sales) {
    map.set(keyOf(row), {
      branchCode: row.branchCode,
      itemGroup: row.itemGroup,
      amountMonths: [...row.amountMonths],
      weightKgMonths: [...row.weightKgMonths],
      amountTotal: row.amountTotal,
      weightKgTotal: row.weightKgTotal,
    });
  }
  for (const row of buy) {
    const key = keyOf(row);
    let entry = map.get(key);
    if (!entry) {
      entry = {
        branchCode: row.branchCode,
        itemGroup: row.itemGroup,
        amountMonths: emptyMonths(),
        weightKgMonths: emptyMonths(),
        amountTotal: 0,
        weightKgTotal: 0,
      };
      map.set(key, entry);
    }
    entry.amountMonths = subtractMonths(entry.amountMonths, row.amountMonths);
    entry.weightKgMonths = subtractMonths(entry.weightKgMonths, row.weightKgMonths);
    entry.amountTotal -= row.amountTotal;
    entry.weightKgTotal -= row.weightKgTotal;
  }
  return [...map.values()].sort((a, b) => {
    const byBranch = compareNullableCode(a.branchCode, b.branchCode);
    if (byBranch !== 0) return byBranch;
    return compareNullableCode(a.itemGroup, b.itemGroup);
  });
}

async function getProfitTradeSummary(ceYear: number, filters?: TradeFilters | null): Promise<TradeSummary> {
  const withoutParty = filters ? { ...filters, sellerId: null, buyerId: null } : filters;
  const [sales, purchases] = await Promise.all([
    getItemTradeSummary("out", ceYear, withoutParty),
    getItemTradeSummary("in", ceYear, withoutParty),
  ]);
  const amount = sales.kpis.amount - purchases.kpis.amount;
  const weightKg = sales.kpis.weightKg - purchases.kpis.weightKg;
  const salesWeightKg = sales.kpis.weightKg;
  const dailyMap = new Map<string, { amount: number; weightKg: number }>();
  for (const row of sales.daily) {
    dailyMap.set(row.day, { amount: row.amount, weightKg: row.weightKg });
  }
  for (const row of purchases.daily) {
    const cur = dailyMap.get(row.day) ?? { amount: 0, weightKg: 0 };
    cur.amount -= row.amount;
    cur.weightKg -= row.weightKg;
    dailyMap.set(row.day, cur);
  }

  return {
    side: "profit",
    ceYear,
    beYear: sales.beYear,
    grain: "item",
    note: "ส่วนต่าง = ยอดขายออก − ยอดซื้อเข้า จากรายการจ่ายแล้ว ไม่ใช่กำไรจากการขายของ Scrapee และไม่ใช่กำไรสุทธิ",
    kpis: {
      amount,
      weightKg,
      tickets: sales.kpis.tickets,
      costAmount: null,
      salesProfit: null,
      avgPerKg: salesWeightKg > 0 ? amount / salesWeightKg : 0,
      salesAmount: sales.kpis.amount,
      purchaseAmount: purchases.kpis.amount,
      salesTickets: sales.kpis.tickets,
      purchaseTickets: purchases.kpis.tickets,
      salesWeightKg,
      purchaseWeightKg: purchases.kpis.weightKg,
    },
    monthly: buildMonthly(
      sales.monthly.map((row, idx) => {
        const buy = purchases.monthly[idx];
        return {
          month: row.month,
          amount: row.amount - (buy?.amount ?? 0),
          weightKg: row.weightKg - (buy?.weightKg ?? 0),
          tickets: row.tickets,
        };
      })
    ),
    daily: [...dailyMap.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([day, row]) => ({ day, amount: row.amount, weightKg: row.weightKg })),
    pivot: subtractPivot(sales.pivot, purchases.pivot),
    availableBeYears: [...new Set([...sales.availableBeYears, ...purchases.availableBeYears])].sort((a, b) => b - a),
    branches: [...new Set([...sales.branches, ...purchases.branches])].sort((a, b) => a.localeCompare(b, "th", { numeric: true })),
    itemGroups: [...new Set([...sales.itemGroups, ...purchases.itemGroups])].sort((a, b) =>
      a.localeCompare(b, "th", { numeric: true })
    ),
  };
}

export async function getTradeSummary(ceYear: number, side: TradeSide, filters?: TradeFilters | null): Promise<TradeSummary> {
  if (side === "profit") return getProfitTradeSummary(ceYear, filters);
  return getItemTradeSummary(side, ceYear, filters);
}

function lineScopeSql(
  startIndex: number,
  filters?: { branch?: string | null; itemGroup?: string | null; sellerId?: string | null; buyerId?: string | null } | null,
  side: "in" | "out" = "in"
): { sql: string; params: string[] } {
  const params: string[] = [];
  let sql = "";
  if (filters?.branch === "__none__") {
    sql += " AND i.branch_code IS NULL";
  } else if (filters?.branch) {
    params.push(filters.branch);
    sql += ` AND i.branch_code = $${startIndex + params.length - 1}`;
  }
  if (filters?.itemGroup === "__none__") {
    sql += " AND i.item_group IS NULL";
  } else if (filters?.itemGroup) {
    params.push(filters.itemGroup);
    sql += ` AND i.item_group = $${startIndex + params.length - 1}`;
  }
  if (side === "in" && filters?.sellerId && filters.sellerId.trim()) {
    params.push(filters.sellerId.trim());
    sql += ` AND t.seller_id = $${startIndex + params.length - 1}`;
  }
  if (side === "out" && filters?.buyerId && filters.buyerId.trim()) {
    params.push(filters.buyerId.trim());
    sql += ` AND ${OUT_BUYER_PARTY_SQL} = $${startIndex + params.length - 1}`;
  }
  return { sql, params };
}

export async function getTradeLines(
  ceYear: number,
  side: "in" | "out",
  filters?: {
    branch?: string | null;
    itemGroup?: string | null;
    sellerId?: string | null;
    sellerName?: string | null;
    buyerId?: string | null;
    buyerName?: string | null;
    month?: number | null;
    page?: number;
    pageSize?: number;
    all?: boolean;
  } | null
): Promise<TradeLinesResult> {
  const month = filters?.month && filters.month >= 1 && filters.month <= 12 ? filters.month : null;
  const range = month ? ceMonthRange(ceYear, month) : ceYearRange(ceYear);
  const all = filters?.all === true;
  const pageSize = all ? 0 : Math.min(Math.max(filters?.pageSize ?? 100, 1), 200);
  const page = all ? 1 : Math.max(filters?.page ?? 1, 1);
  const extra = lineScopeSql(3, filters, side);
  const paidCol = side === "in" ? "t.paid_timestamp" : "t.paid_at";
  const itemsTable = side === "in" ? "in_ticket_items" : "out_ticket_items";
  const ticketsTable = side === "in" ? "in_tickets" : "out_tickets";
  const runningCol = side === "in" ? "t.running_number" : "NULL::text";
  const where = `t.is_deleted = FALSE AND t.status = 'paid' AND ${paidCol} >= $1 AND ${paidCol} < $2${extra.sql}`;
  const params: unknown[] = [range.from, range.to, ...extra.params];
  const offset = all ? 0 : (page - 1) * pageSize;
  const pool = getPool();
  const limitSql = all ? "" : ` LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
  const rowParams = all ? params : [...params, pageSize, offset];

  const [kpiQ, rowsQ] = await Promise.all([
    pool.query<{ amount: number; weight_kg: number; lines: number; tickets: number }>(
      `SELECT COALESCE(SUM(${ITEM_NET_WEIGHT} * COALESCE(i.paid_price,0)),0)::float AS amount,
              COALESCE(SUM(${ITEM_NET_WEIGHT} * COALESCE(p.kg_conversion,1)),0)::float AS weight_kg,
              COUNT(*)::int AS lines,
              COUNT(DISTINCT i.ticket_id)::int AS tickets
       FROM ${itemsTable} i
       JOIN ${ticketsTable} t ON t.id = i.ticket_id
       LEFT JOIN products p ON p.id = i.product_id
       WHERE ${where}`,
      params
    ),
    pool.query<{
      ticket_id: string;
      number: number | null;
      running_number: string | null;
      paid_day: string;
      code: string | null;
      name: string | null;
      branch_code: string | null;
      item_group: string | null;
      weight_gross: number;
      deduct: number;
      waste: number;
      weight: number;
      weight_kg: number;
      paid_price: number;
      amount: number;
    }>(
      `SELECT t.id AS ticket_id, t.number, ${runningCol} AS running_number,
              (${paidCol} AT TIME ZONE 'Asia/Bangkok')::date::text AS paid_day,
              i.code, i.name, i.branch_code, i.item_group,
              COALESCE(i.weight,0)::float AS weight_gross,
              COALESCE(i.deduct,0)::float AS deduct,
              (${ITEM_WASTE_WEIGHT})::float AS waste,
              ${ITEM_NET_WEIGHT}::float AS weight,
              (${ITEM_NET_WEIGHT} * COALESCE(p.kg_conversion,1))::float AS weight_kg,
              COALESCE(i.paid_price,0)::float AS paid_price,
              (${ITEM_NET_WEIGHT} * COALESCE(i.paid_price,0))::float AS amount
       FROM ${itemsTable} i
       JOIN ${ticketsTable} t ON t.id = i.ticket_id
       LEFT JOIN products p ON p.id = i.product_id
       WHERE ${where}
       ORDER BY ${paidCol} DESC NULLS LAST, t.id, i.client_id
       ${limitSql}`,
      rowParams
    ),
  ]);

  const rows: TradeLine[] = rowsQ.rows.map((row) => ({
    ticketId: String(row.ticket_id),
    ticketNumber: row.number == null ? null : num(row.number),
    runningNumber: row.running_number,
    paidAt: row.paid_day,
    code: row.code,
    name: row.name,
    branchCode: row.branch_code,
    itemGroup: row.item_group,
    weightGross: num(row.weight_gross),
    deduct: num(row.deduct),
    waste: num(row.waste),
    weight: num(row.weight),
    weightKg: num(row.weight_kg),
    paidPrice: num(row.paid_price),
    amount: num(row.amount),
  }));

  return {
    side,
    ceYear,
    beYear: toBuddhistYear(ceYear),
    month,
    branch: filters?.branch ?? null,
    itemGroup: filters?.itemGroup ?? null,
    sellerId: side === "in" ? filters?.sellerId ?? null : null,
    sellerName: side === "in" ? filters?.sellerName ?? null : null,
    buyerId: side === "out" ? filters?.buyerId ?? null : null,
    buyerName: side === "out" ? filters?.buyerName ?? null : null,
    page,
    pageSize: all ? num(kpiQ.rows[0]?.lines) || 1 : pageSize,
    totalLines: num(kpiQ.rows[0]?.lines),
    totalTickets: num(kpiQ.rows[0]?.tickets),
    amount: num(kpiQ.rows[0]?.amount),
    weightKg: num(kpiQ.rows[0]?.weight_kg),
    rows,
  };
}

function smallInCte(filterSql = ""): string {
  return `
  WITH paid AS (
    SELECT t.id, t.net::float AS net, t.paid_timestamp
    FROM in_tickets t
    WHERE t.is_deleted = FALSE AND t.status = 'paid' AND t.paid_timestamp IS NOT NULL
      AND t.paid_timestamp >= $1 AND t.paid_timestamp < $2
      AND t.net > 0 AND t.net < $3
  ),
  branch_amt AS (
    SELECT i.ticket_id, i.branch_code,
           SUM(${ITEM_NET_WEIGHT} * COALESCE(i.paid_price,0))::float AS amt
    FROM in_ticket_items i
    JOIN paid p ON p.id = i.ticket_id
    GROUP BY i.ticket_id, i.branch_code
  ),
  ticket_branch AS (
    SELECT DISTINCT ON (ticket_id) ticket_id, branch_code
    FROM branch_amt
    ORDER BY ticket_id, amt DESC NULLS LAST, branch_code NULLS LAST
  ),
  tagged AS (
    SELECT p.id, p.net, p.paid_timestamp, tb.branch_code
    FROM paid p
    LEFT JOIN ticket_branch tb ON tb.ticket_id = p.id
    WHERE TRUE${filterSql}
  )`;
}

function smallInFilterSql(startIndex: number, filters?: SmallInFilters | null): { sql: string; params: unknown[] } {
  const params: unknown[] = [];
  let sql = "";
  const branches = (filters?.branches ?? []).filter(Boolean);
  const groups = (filters?.itemGroups ?? []).filter(Boolean);

  if (branches.length) {
    const codes = branches.filter((code) => code !== SMALL_IN_NONE);
    const includeNone = branches.includes(SMALL_IN_NONE);
    if (codes.length && includeNone) {
      params.push(codes);
      sql += ` AND (tb.branch_code = ANY($${startIndex + params.length - 1}::text[]) OR tb.branch_code IS NULL)`;
    } else if (codes.length) {
      params.push(codes);
      sql += ` AND tb.branch_code = ANY($${startIndex + params.length - 1}::text[])`;
    } else if (includeNone) {
      sql += ` AND tb.branch_code IS NULL`;
    }
  }

  if (groups.length) {
    const codes = groups.filter((code) => code !== SMALL_IN_NONE);
    const includeNone = groups.includes(SMALL_IN_NONE);
    if (codes.length && includeNone) {
      params.push(codes);
      sql += ` AND EXISTS (
        SELECT 1 FROM in_ticket_items i
        WHERE i.ticket_id = p.id
          AND (i.item_group = ANY($${startIndex + params.length - 1}::text[]) OR i.item_group IS NULL)
      )`;
    } else if (codes.length) {
      params.push(codes);
      sql += ` AND EXISTS (
        SELECT 1 FROM in_ticket_items i
        WHERE i.ticket_id = p.id AND i.item_group = ANY($${startIndex + params.length - 1}::text[])
      )`;
    } else if (includeNone) {
      sql += ` AND EXISTS (
        SELECT 1 FROM in_ticket_items i
        WHERE i.ticket_id = p.id AND i.item_group IS NULL
      )`;
    }
  }

  return { sql, params };
}

function smallInItemGroupOnItemsSql(
  startIndex: number,
  filters?: SmallInFilters | null
): { sql: string; params: unknown[] } {
  const groups = (filters?.itemGroups ?? []).filter(Boolean);
  if (!groups.length) return { sql: "", params: [] };
  const codes = groups.filter((code) => code !== SMALL_IN_NONE);
  const includeNone = groups.includes(SMALL_IN_NONE);
  if (codes.length && includeNone) {
    return {
      sql: ` AND (i.item_group = ANY($${startIndex}::text[]) OR i.item_group IS NULL)`,
      params: [codes],
    };
  }
  if (codes.length) {
    return {
      sql: ` AND i.item_group = ANY($${startIndex}::text[])`,
      params: [codes],
    };
  }
  return { sql: ` AND i.item_group IS NULL`, params: [] };
}

function sortFilterCodes(codes: string[]): string[] {
  return [...new Set(codes)].sort((a, b) => {
    if (a === SMALL_IN_NONE) return 1;
    if (b === SMALL_IN_NONE) return -1;
    return a.localeCompare(b, "th", { numeric: true });
  });
}

export async function getSmallInPurchases(
  ceYear: number,
  cap: SmallInCap,
  filters?: SmallInFilters | null
): Promise<SmallInResult> {
  const pool = getPool();
  const range = ceYearRange(ceYear);
  const extra = smallInFilterSql(4, filters);
  const cte = smallInCte(extra.sql);
  const params: unknown[] = [range.from, range.to, cap, ...extra.params];
  const itemGroupExtra = smallInItemGroupOnItemsSql(params.length + 1, filters);
  const itemGroupParams: unknown[] = [...params, ...itemGroupExtra.params];
  const baseParams: unknown[] = [range.from, range.to, cap];
  const baseCte = smallInCte();

  const [kpiQ, monthQ, dayQ, branchQ, itemGroupQ, itemGroupDayQ, optionBranchQ, optionGroupQ, years] = await Promise.all([
    pool.query<{ tickets: number; amount: number }>(
      `${cte}
       SELECT COUNT(*)::int AS tickets, COALESCE(SUM(net),0)::float AS amount
       FROM tagged`,
      params
    ),
    pool.query<{ month: number; tickets: number; amount: number }>(
      `${cte}
       SELECT EXTRACT(MONTH FROM (paid_timestamp AT TIME ZONE 'Asia/Bangkok'))::int AS month,
              COUNT(*)::int AS tickets,
              COALESCE(SUM(net),0)::float AS amount
       FROM tagged
       GROUP BY 1`,
      params
    ),
    pool.query<{ day: string; tickets: number; amount: number }>(
      `${cte}
       SELECT (paid_timestamp AT TIME ZONE 'Asia/Bangkok')::date::text AS day,
              COUNT(*)::int AS tickets,
              COALESCE(SUM(net),0)::float AS amount
       FROM tagged
       GROUP BY 1
       ORDER BY 1`,
      params
    ),
    pool.query<{ branch_code: string | null; tickets: number; amount: number }>(
      `${cte}
       SELECT branch_code, COUNT(*)::int AS tickets, COALESCE(SUM(net),0)::float AS amount
       FROM tagged
       GROUP BY branch_code
       ORDER BY amount DESC, branch_code NULLS LAST`,
      params
    ),
    pool.query<{ item_group: string | null; tickets: number; amount: number }>(
      `${cte}
       SELECT i.item_group, COUNT(DISTINCT i.ticket_id)::int AS tickets,
              COALESCE(SUM(${ITEM_NET_WEIGHT} * COALESCE(i.paid_price,0)),0)::float AS amount
       FROM tagged tg
       JOIN in_ticket_items i ON i.ticket_id = tg.id
       WHERE TRUE${itemGroupExtra.sql}
       GROUP BY i.item_group
       ORDER BY amount DESC, i.item_group NULLS LAST`,
      itemGroupParams
    ),
    pool.query<{ day: string; item_group: string | null; amount: number }>(
      `${cte}
       SELECT (tg.paid_timestamp AT TIME ZONE 'Asia/Bangkok')::date::text AS day,
              i.item_group,
              COALESCE(SUM(${ITEM_NET_WEIGHT} * COALESCE(i.paid_price,0)),0)::float AS amount
       FROM tagged tg
       JOIN in_ticket_items i ON i.ticket_id = tg.id
       WHERE TRUE${itemGroupExtra.sql}
       GROUP BY 1, i.item_group`,
      itemGroupParams
    ),
    pool.query<{ branch_code: string | null }>(
      `${baseCte}
       SELECT DISTINCT branch_code FROM tagged`,
      baseParams
    ),
    pool.query<{ item_group: string | null }>(
      `${baseCte}
       SELECT DISTINCT i.item_group
       FROM paid p
       JOIN in_ticket_items i ON i.ticket_id = p.id`,
      baseParams
    ),
    getAvailableBeYears(),
  ]);

  const tickets = num(kpiQ.rows[0]?.tickets);
  const amount = num(kpiQ.rows[0]?.amount);
  const byMonth = new Map(monthQ.rows.map((row) => [num(row.month), row]));
  const monthly = Array.from({ length: 12 }, (_, i) => {
    const month = i + 1;
    const row = byMonth.get(month);
    return {
      month,
      tickets: row ? num(row.tickets) : 0,
      amount: row ? num(row.amount) : 0,
    };
  });

  return {
    ceYear,
    beYear: toBuddhistYear(ceYear),
    cap,
    tickets,
    amount,
    availableBeYears: years.length ? years : [toBuddhistYear(ceYear)],
    monthly,
    daily: dayQ.rows.map((row) => ({
      day: row.day,
      tickets: num(row.tickets),
      amount: num(row.amount),
    })),
    branches: branchQ.rows.map((row) => ({
      branchCode: row.branch_code,
      tickets: num(row.tickets),
      amount: num(row.amount),
      share: amount > 0 ? num(row.amount) / amount : 0,
    })),
    itemGroups: (() => {
      const rows = itemGroupQ.rows.map((row) => ({
        itemGroup: row.item_group,
        tickets: num(row.tickets),
        amount: num(row.amount),
      }));
      const groupAmount = rows.reduce((sum, row) => sum + row.amount, 0);
      return rows.map((row) => ({
        ...row,
        share: groupAmount > 0 ? row.amount / groupAmount : 0,
      }));
    })(),
    itemGroupDaily: itemGroupDayQ.rows.map((row) => ({
      day: row.day,
      itemGroup: row.item_group,
      amount: num(row.amount),
    })),
    filterBranches: sortFilterCodes(
      optionBranchQ.rows.map((row) => row.branch_code ?? SMALL_IN_NONE)
    ),
    filterItemGroups: sortFilterCodes(
      optionGroupQ.rows.map((row) => row.item_group ?? SMALL_IN_NONE)
    ),
  };
}

const LIST_PAGE_SIZE = 1000;

function ticketHasItemSql(
  startIndex: number,
  filters?: { branch?: string | null; itemGroup?: string | null; buyerId?: string | null } | null
): { sql: string; params: string[] } {
  const params: string[] = [];
  let sql = "";
  if (filters?.branch) {
    params.push(filters.branch);
    sql += ` AND EXISTS (SELECT 1 FROM out_ticket_items i WHERE i.ticket_id = t.id AND i.branch_code = $${startIndex + params.length - 1})`;
  }
  if (filters?.itemGroup) {
    params.push(filters.itemGroup);
    sql += ` AND EXISTS (SELECT 1 FROM out_ticket_items i WHERE i.ticket_id = t.id AND i.item_group = $${startIndex + params.length - 1})`;
  }
  if (filters?.buyerId && filters.buyerId.trim()) {
    params.push(filters.buyerId.trim());
    sql += ` AND ${OUT_BUYER_PARTY_SQL} = $${startIndex + params.length - 1}`;
  }
  return { sql, params };
}

export async function getSalesProfit(opts: {
  ceYear: number;
  branch?: string | null;
  itemGroup?: string | null;
  buyerId?: string | null;
  page?: number | null;
  all?: boolean;
}): Promise<SalesProfitResult> {
  const range = ceYearRange(opts.ceYear);
  const pool = getPool();
  const extra = ticketHasItemSql(3, opts);
  const params: unknown[] = [range.from, range.to, ...extra.params];
  const where = `t.is_deleted = FALSE AND t.status = 'paid' AND t.paid_at >= $1 AND t.paid_at < $2${extra.sql}`;

  const [kpiQ, monthQ, dayQ, countQ, optionQ, years] = await Promise.all([
    pool.query<{ tickets: number; net: number; cost: number; profit: number; weight: number }>(
      `SELECT COUNT(*)::int AS tickets,
              COALESCE(SUM(t.net),0)::float AS net,
              COALESCE(SUM(t.cost),0)::float AS cost,
              COALESCE(SUM(t.profit),0)::float AS profit,
              COALESCE(SUM(t.pure_weight),0)::float AS weight
       FROM out_tickets t
       WHERE ${where}`,
      params
    ),
    pool.query<{ month: number; tickets: number; net: number; cost: number; profit: number; weight: number }>(
      `SELECT EXTRACT(MONTH FROM (t.paid_at AT TIME ZONE 'Asia/Bangkok'))::int AS month,
              COUNT(*)::int AS tickets,
              COALESCE(SUM(t.net),0)::float AS net,
              COALESCE(SUM(t.cost),0)::float AS cost,
              COALESCE(SUM(t.profit),0)::float AS profit,
              COALESCE(SUM(t.pure_weight),0)::float AS weight
       FROM out_tickets t
       WHERE ${where}
       GROUP BY 1
       ORDER BY 1`,
      params
    ),
    pool.query<{ day: string; tickets: number; net: number; cost: number; profit: number }>(
      `SELECT (t.paid_at AT TIME ZONE 'Asia/Bangkok')::date::text AS day,
              COUNT(*)::int AS tickets,
              COALESCE(SUM(t.net),0)::float AS net,
              COALESCE(SUM(t.cost),0)::float AS cost,
              COALESCE(SUM(t.profit),0)::float AS profit
       FROM out_tickets t
       WHERE ${where}
       GROUP BY 1
       ORDER BY 1`,
      params
    ),
    pool.query<{ total: number }>(`SELECT COUNT(*)::int AS total FROM out_tickets t WHERE ${where}`, params),
    pool.query<{ branch_code: string | null; item_group: string | null }>(
      `SELECT DISTINCT i.branch_code, i.item_group
       FROM out_ticket_items i
       JOIN out_tickets t ON t.id = i.ticket_id
       WHERE t.is_deleted = FALSE AND t.status = 'paid'
         AND t.paid_at >= $1 AND t.paid_at < $2`,
      [range.from, range.to]
    ),
    getAvailableBeYears(),
  ]);

  const total = num(countQ.rows[0]?.total);
  const pageSize = LIST_PAGE_SIZE;
  const pageCount = Math.max(1, Math.ceil(total / pageSize) || 1);
  const page = opts.all ? 1 : Math.min(Math.max(1, Math.trunc(opts.page ?? 1)), pageCount);
  const limitSql = opts.all ? "" : ` LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
  const rowParams = opts.all ? params : [...params, pageSize, (page - 1) * pageSize];

  const rowsQ = await pool.query<{
    id: string;
    number: number | null;
    paid_at: Date | null;
    buyer_id: string | null;
    buyer_fullname: string | null;
    net: number;
    cost: number;
    profit: number;
    weight: number;
  }>(
    `SELECT t.id, t.number, t.paid_at, t.buyer_id, t.buyer_fullname,
            COALESCE(t.net,0)::float AS net,
            COALESCE(t.cost,0)::float AS cost,
            COALESCE(t.profit,0)::float AS profit,
            COALESCE(t.pure_weight,0)::float AS weight
     FROM out_tickets t
     WHERE ${where}
     ORDER BY t.paid_at DESC NULLS LAST, t.number DESC NULLS LAST
     ${limitSql}`,
    rowParams
  );

  const kpi = kpiQ.rows[0];
  return {
    note: "ค่าจากหัวตั๋วขายที่ Scrapee คำนวณ · ไม่ใช่ส่วนต่างขาย−ซื้อ และไม่ใช่กำไรสุทธิ",
    ceYear: opts.ceYear,
    beYear: toBuddhistYear(opts.ceYear),
    tickets: num(kpi?.tickets),
    net: num(kpi?.net),
    cost: num(kpi?.cost),
    profit: num(kpi?.profit),
    weight: num(kpi?.weight),
    page,
    pageSize: opts.all ? Math.max(total, 1) : pageSize,
    total,
    availableBeYears: years.length ? years : [toBuddhistYear(opts.ceYear)],
    branches: sortFilterCodes(optionQ.rows.map((row) => row.branch_code).filter((v): v is string => Boolean(v))),
    itemGroups: sortFilterCodes(optionQ.rows.map((row) => row.item_group).filter((v): v is string => Boolean(v))),
    monthly: monthQ.rows.map((row) => ({
      month: num(row.month),
      net: num(row.net),
      cost: num(row.cost),
      profit: num(row.profit),
      tickets: num(row.tickets),
      weight: num(row.weight),
    })),
    daily: dayQ.rows.map((row) => ({
      day: row.day,
      net: num(row.net),
      cost: num(row.cost),
      profit: num(row.profit),
      tickets: num(row.tickets),
    })),
    rows: rowsQ.rows.map((row) => ({
      id: String(row.id),
      number: row.number == null ? null : num(row.number),
      paidAt: row.paid_at ? new Date(row.paid_at).toISOString() : null,
      buyerId: row.buyer_id,
      buyerName: row.buyer_fullname,
      net: num(row.net),
      cost: num(row.cost),
      profit: num(row.profit),
      weight: num(row.weight),
    })),
  };
}

function transformItemScopeSql(
  startIndex: number,
  filters?: { branch?: string | null; itemGroup?: string | null } | null
): { sql: string; params: string[] } {
  const params: string[] = [];
  let sql = "";
  if (filters?.branch) {
    params.push(filters.branch);
    sql += ` AND EXISTS (SELECT 1 FROM stock_transform_items x WHERE x.transform_id = t.id AND x.branch_code = $${startIndex + params.length - 1})`;
  }
  if (filters?.itemGroup) {
    params.push(filters.itemGroup);
    sql += ` AND EXISTS (SELECT 1 FROM stock_transform_items x WHERE x.transform_id = t.id AND x.item_group = $${startIndex + params.length - 1})`;
  }
  return { sql, params };
}

export async function getStockTransforms(opts: {
  ceYear: number;
  month: number;
  branch?: string | null;
  itemGroup?: string | null;
}): Promise<StockTransformsResult> {
  const month = Math.min(12, Math.max(1, Math.trunc(opts.month)));
  const monthRange = ceMonthRange(opts.ceYear, month);
  const yearRange = ceYearRange(opts.ceYear);
  const pool = getPool();
  const extra = transformItemScopeSql(3, opts);
  const monthParams: unknown[] = [monthRange.from, monthRange.to, ...extra.params];
  const yearParams: unknown[] = [yearRange.from, yearRange.to, ...extra.params];
  const where = `t.is_deleted = FALSE AND t.created_at >= $1 AND t.created_at < $2${extra.sql}`;
  const kgSql = `COALESCE(i.weight,0) * COALESCE(p.kg_conversion,1)`;

  const [kpiQ, monthQ, optionQ, years] = await Promise.all([
    pool.query<{ transforms: number; input_kg: number; output_kg: number }>(
      `SELECT COUNT(*)::int AS transforms,
              COALESCE(SUM(v.input_kg),0)::float AS input_kg,
              COALESCE(SUM(v.output_kg),0)::float AS output_kg
       FROM (
         SELECT t.id,
                COALESCE(SUM(CASE WHEN i.direction = 'input' THEN ${kgSql} ELSE 0 END),0) AS input_kg,
                COALESCE(SUM(CASE WHEN i.direction = 'output' THEN ${kgSql} ELSE 0 END),0) AS output_kg
         FROM stock_transforms t
         LEFT JOIN stock_transform_items i ON i.transform_id = t.id
         LEFT JOIN products p ON p.id = i.product_id
         WHERE ${where}
         GROUP BY t.id
       ) v`,
      monthParams
    ),
    pool.query<{ month: number; transforms: number; input_kg: number; output_kg: number }>(
      `SELECT EXTRACT(MONTH FROM (t.created_at AT TIME ZONE 'Asia/Bangkok'))::int AS month,
              COUNT(DISTINCT t.id)::int AS transforms,
              COALESCE(SUM(CASE WHEN i.direction = 'input' THEN ${kgSql} ELSE 0 END),0)::float AS input_kg,
              COALESCE(SUM(CASE WHEN i.direction = 'output' THEN ${kgSql} ELSE 0 END),0)::float AS output_kg
       FROM stock_transforms t
       LEFT JOIN stock_transform_items i ON i.transform_id = t.id
       LEFT JOIN products p ON p.id = i.product_id
       WHERE ${where}
       GROUP BY 1
       ORDER BY 1`,
      yearParams
    ),
    pool.query<{ branch_code: string | null; item_group: string | null }>(
      `SELECT DISTINCT i.branch_code, i.item_group
       FROM stock_transform_items i
       JOIN stock_transforms t ON t.id = i.transform_id
       WHERE t.is_deleted = FALSE AND t.created_at >= $1 AND t.created_at < $2`,
      [yearRange.from, yearRange.to]
    ),
    pool.query<{ y: number }>(
      `SELECT DISTINCT EXTRACT(YEAR FROM (created_at AT TIME ZONE 'Asia/Bangkok'))::int AS y
       FROM stock_transforms
       WHERE is_deleted = FALSE AND created_at IS NOT NULL
       ORDER BY 1 DESC`
    ),
  ]);

  const headQ = await pool.query<{
    id: string;
    created_at: Date | null;
    recorded_by_name: string | null;
    input_lines: number;
    output_lines: number;
    input_kg: number;
    output_kg: number;
  }>(
    `SELECT t.id, t.created_at, e.display_name AS recorded_by_name,
            COUNT(*) FILTER (WHERE i.direction = 'input')::int AS input_lines,
            COUNT(*) FILTER (WHERE i.direction = 'output')::int AS output_lines,
            COALESCE(SUM(CASE WHEN i.direction = 'input' THEN ${kgSql} ELSE 0 END),0)::float AS input_kg,
            COALESCE(SUM(CASE WHEN i.direction = 'output' THEN ${kgSql} ELSE 0 END),0)::float AS output_kg
     FROM stock_transforms t
     LEFT JOIN stock_transform_items i ON i.transform_id = t.id
     LEFT JOIN products p ON p.id = i.product_id
     LEFT JOIN employees e ON e.id = t.recorded_by
     WHERE ${where}
     GROUP BY t.id, t.created_at, e.display_name
     ORDER BY t.created_at DESC NULLS LAST`,
    monthParams
  );

  const ids = headQ.rows.map((row) => String(row.id));
  const itemQ =
    ids.length === 0
      ? { rows: [] as Array<{
          transform_id: string;
          direction: string;
          code: string | null;
          name: string | null;
          branch_code: string | null;
          item_group: string | null;
          weight: number;
          weight_kg: number;
        }> }
      : await pool.query<{
          transform_id: string;
          direction: string;
          code: string | null;
          name: string | null;
          branch_code: string | null;
          item_group: string | null;
          weight: number;
          weight_kg: number;
        }>(
          `SELECT i.transform_id, i.direction, i.code, i.name, i.branch_code, i.item_group,
                  COALESCE(i.weight,0)::float AS weight,
                  (${kgSql})::float AS weight_kg
           FROM stock_transform_items i
           LEFT JOIN products p ON p.id = i.product_id
           WHERE i.transform_id = ANY($1::text[])
           ORDER BY i.direction, i.line_index`,
          [ids]
        );

  const itemsById = new Map<string, TransformItem[]>();
  for (const row of itemQ.rows) {
    const id = String(row.transform_id);
    const list = itemsById.get(id) ?? [];
    list.push({
      direction: row.direction === "output" ? "output" : "input",
      code: row.code,
      name: row.name,
      branchCode: row.branch_code,
      itemGroup: row.item_group,
      weight: num(row.weight),
      weightKg: num(row.weight_kg),
    });
    itemsById.set(id, list);
  }

  const rows: TransformRow[] = headQ.rows.map((row) => ({
    id: String(row.id),
    createdAt: row.created_at ? new Date(row.created_at).toISOString() : null,
    recordedByName: row.recorded_by_name,
    inputLines: num(row.input_lines),
    outputLines: num(row.output_lines),
    inputKg: num(row.input_kg),
    outputKg: num(row.output_kg),
    items: itemsById.get(String(row.id)) ?? [],
  }));

  const inputKg = num(kpiQ.rows[0]?.input_kg);
  const outputKg = num(kpiQ.rows[0]?.output_kg);
  const transformYears = years.rows.map((row) => toBuddhistYear(num(row.y)));
  const byMonth = new Map(monthQ.rows.map((row) => [num(row.month), row]));

  return {
    note: "แปรสภาพจาก stock_transforms · น้ำหนักกก. = weight × kg_conversion · ไม่มีราคาบนรายการนี้",
    ceYear: opts.ceYear,
    beYear: toBuddhistYear(opts.ceYear),
    month,
    transforms: num(kpiQ.rows[0]?.transforms),
    inputKg,
    outputKg,
    deltaKg: outputKg - inputKg,
    total: rows.length,
    availableBeYears: transformYears.length ? transformYears : [toBuddhistYear(opts.ceYear)],
    branches: sortFilterCodes(optionQ.rows.map((row) => row.branch_code).filter((v): v is string => Boolean(v))),
    itemGroups: sortFilterCodes(optionQ.rows.map((row) => row.item_group).filter((v): v is string => Boolean(v))),
    monthly: Array.from({ length: 12 }, (_, i) => {
      const row = byMonth.get(i + 1);
      return {
        month: i + 1,
        transforms: num(row?.transforms),
        inputKg: num(row?.input_kg),
        outputKg: num(row?.output_kg),
      };
    }),
    rows,
  };
}

function yearCompareFilterSql(startIndex: number, filters?: YearCompareFilters | null): { sql: string; params: unknown[] } {
  const params: unknown[] = [];
  let sql = "";
  if (filters?.branch) {
    params.push(filters.branch);
    sql += ` AND i.branch_code = $${startIndex + params.length - 1}`;
  }
  if (filters?.itemGroups?.length) {
    params.push(filters.itemGroups);
    sql += ` AND i.item_group = ANY($${startIndex + params.length - 1}::text[])`;
  }
  return { sql, params };
}

function ytdRange(ceYear: number, throughMonth: number): DateRange {
  const month = Math.min(12, Math.max(1, throughMonth));
  return { from: bangkokDayStart(ceYear, 1, 1), to: bangkokDayStart(ceYear, month + 1, 1) };
}

function monthSeries(
  byMonth: Map<number, Omit<YearCompareMonth, "month">>,
  lastVisible: number | null
): YearCompareMonth[] {
  return Array.from({ length: 12 }, (_, i) => {
    const month = i + 1;
    if (lastVisible != null && month > lastVisible) {
      return { month, tickets: null, customers: null, weightKg: null, amount: null };
    }
    const row = byMonth.get(month);
    return {
      month,
      tickets: row ? row.tickets : 0,
      customers: row ? row.customers : 0,
      weightKg: row ? row.weightKg : 0,
      amount: row ? row.amount : 0,
    };
  });
}

function totalsFromRow(row?: { tickets: number; customers: number; weight_kg: number; amount: number } | null): YearCompareTotals {
  return withTicketsPerCustomer({
    tickets: num(row?.tickets),
    customers: num(row?.customers),
    weightKg: num(row?.weight_kg),
    amount: num(row?.amount),
  });
}

function completenessLabel(beYear: number, months: number[]): string {
  if (!months.length) return `ปี ${beYear} ไม่มีข้อมูลในคลัง`;
  const first = THAI_MONTHS_SHORT[months[0]! - 1];
  const last = THAI_MONTHS_SHORT[months[months.length - 1]! - 1];
  if (months.length === 12) return `ปี ${beYear} ครบ ม.ค.–ธ.ค.`;
  if (months[0] === months[months.length - 1]) return `ปี ${beYear} มี ${first}`;
  return `ปี ${beYear} มี ${first}–${last}`;
}

async function queryYearCompareSide(
  ceYear: number,
  throughMonth: number,
  lastVisibleMonth: number | null,
  filters?: YearCompareFilters | null
): Promise<{
  ytd: YearCompareTotals;
  monthly: YearCompareMonth[];
  monthsWithData: number[];
  lastPaidAt: string | null;
  categories: Map<string, { ytd: YearCompareTotals; months: YearCompareMonth[] }>;
}> {
  const yearRange = ceYearRange(ceYear);
  const ytd = ytdRange(ceYear, throughMonth);
  const extraYear = yearCompareFilterSql(3, filters);
  const extraYtd = yearCompareFilterSql(3, filters);
  const yearParams: unknown[] = [yearRange.from, yearRange.to, ...extraYear.params];
  const ytdParams: unknown[] = [ytd.from, ytd.to, ...extraYtd.params];
  const dateWhere = `t.is_deleted = FALSE AND t.status = 'paid' AND t.paid_timestamp IS NOT NULL AND t.paid_timestamp >= $1 AND t.paid_timestamp < $2`;
  const pool = getPool();

  const [monthQ, ytdQ, catMonthQ, catYtdQ, lastQ] = await Promise.all([
    pool.query<{ month: number; tickets: number; customers: number; weight_kg: number; amount: number }>(
      `SELECT EXTRACT(MONTH FROM (t.paid_timestamp AT TIME ZONE 'Asia/Bangkok'))::int AS month,
              COUNT(DISTINCT t.id)::int AS tickets,
              COUNT(DISTINCT t.seller_id)::int AS customers,
              COALESCE(SUM(${ITEM_NET_WEIGHT} * COALESCE(p.kg_conversion,1)),0)::float AS weight_kg,
              COALESCE(SUM(${ITEM_NET_WEIGHT} * COALESCE(i.paid_price,0)),0)::float AS amount
       FROM in_ticket_items i
       JOIN in_tickets t ON t.id = i.ticket_id
       LEFT JOIN products p ON p.id = i.product_id
       WHERE ${dateWhere}${extraYear.sql}
       GROUP BY 1`,
      yearParams
    ),
    pool.query<{ tickets: number; customers: number; weight_kg: number; amount: number }>(
      `SELECT COUNT(DISTINCT t.id)::int AS tickets,
              COUNT(DISTINCT t.seller_id)::int AS customers,
              COALESCE(SUM(${ITEM_NET_WEIGHT} * COALESCE(p.kg_conversion,1)),0)::float AS weight_kg,
              COALESCE(SUM(${ITEM_NET_WEIGHT} * COALESCE(i.paid_price,0)),0)::float AS amount
       FROM in_ticket_items i
       JOIN in_tickets t ON t.id = i.ticket_id
       LEFT JOIN products p ON p.id = i.product_id
       WHERE ${dateWhere}${extraYtd.sql}`,
      ytdParams
    ),
    pool.query<{ month: number; item_group: string | null; tickets: number; customers: number; weight_kg: number; amount: number }>(
      `SELECT EXTRACT(MONTH FROM (t.paid_timestamp AT TIME ZONE 'Asia/Bangkok'))::int AS month,
              i.item_group,
              COUNT(DISTINCT t.id)::int AS tickets,
              COUNT(DISTINCT t.seller_id)::int AS customers,
              COALESCE(SUM(${ITEM_NET_WEIGHT} * COALESCE(p.kg_conversion,1)),0)::float AS weight_kg,
              COALESCE(SUM(${ITEM_NET_WEIGHT} * COALESCE(i.paid_price,0)),0)::float AS amount
       FROM in_ticket_items i
       JOIN in_tickets t ON t.id = i.ticket_id
       LEFT JOIN products p ON p.id = i.product_id
       WHERE ${dateWhere}${extraYear.sql}
       GROUP BY 1, i.item_group`,
      yearParams
    ),
    pool.query<{ item_group: string | null; tickets: number; customers: number; weight_kg: number; amount: number }>(
      `SELECT i.item_group,
              COUNT(DISTINCT t.id)::int AS tickets,
              COUNT(DISTINCT t.seller_id)::int AS customers,
              COALESCE(SUM(${ITEM_NET_WEIGHT} * COALESCE(p.kg_conversion,1)),0)::float AS weight_kg,
              COALESCE(SUM(${ITEM_NET_WEIGHT} * COALESCE(i.paid_price,0)),0)::float AS amount
       FROM in_ticket_items i
       JOIN in_tickets t ON t.id = i.ticket_id
       LEFT JOIN products p ON p.id = i.product_id
       WHERE ${dateWhere}${extraYtd.sql}
       GROUP BY i.item_group`,
      ytdParams
    ),
    pool.query<{ last_paid: Date | null }>(
      `SELECT MAX(t.paid_timestamp) AS last_paid
       FROM in_ticket_items i
       JOIN in_tickets t ON t.id = i.ticket_id
       WHERE ${dateWhere}${extraYear.sql}`,
      yearParams
    ),
  ]);

  const monthlyMap = new Map<number, Omit<YearCompareMonth, "month">>();
  for (const row of monthQ.rows) {
    monthlyMap.set(num(row.month), {
      tickets: num(row.tickets),
      customers: num(row.customers),
      weightKg: num(row.weight_kg),
      amount: num(row.amount),
    });
  }
  const monthsWithData = [...monthlyMap.keys()].filter((m) => (monthlyMap.get(m)?.tickets ?? 0) > 0).sort((a, b) => a - b);
  const visible = lastVisibleMonth == null && monthsWithData.length === 0 ? 0 : lastVisibleMonth;
  const monthly = monthSeries(monthlyMap, visible === 0 ? 0 : visible);

  const catMonths = new Map<string, Map<number, Omit<YearCompareMonth, "month">>>();
  for (const row of catMonthQ.rows) {
    const key = row.item_group ?? "";
    let map = catMonths.get(key);
    if (!map) {
      map = new Map();
      catMonths.set(key, map);
    }
    map.set(num(row.month), {
      tickets: num(row.tickets),
      customers: num(row.customers),
      weightKg: num(row.weight_kg),
      amount: num(row.amount),
    });
  }

  const categories = new Map<string, { ytd: YearCompareTotals; months: YearCompareMonth[] }>();
  const keys = new Set([...catYtdQ.rows.map((r) => r.item_group ?? ""), ...catMonths.keys()]);
  for (const key of keys) {
    const ytdRow = catYtdQ.rows.find((r) => (r.item_group ?? "") === key);
    categories.set(key, {
      ytd: totalsFromRow(ytdRow),
      months: monthSeries(catMonths.get(key) ?? new Map(), visible === 0 ? 0 : visible),
    });
  }

  return {
    ytd: totalsFromRow(ytdQ.rows[0]),
    monthly,
    monthsWithData,
    lastPaidAt: lastQ.rows[0]?.last_paid ? new Date(lastQ.rows[0].last_paid).toISOString() : null,
    categories,
  };
}

export async function getYearCompare(opts: {
  ceYear: number;
  compareCeYear?: number | null;
  throughMonth?: number | null;
  includeCurrentMonth?: boolean;
  filters?: YearCompareFilters | null;
}): Promise<YearCompareResult> {
  const ceYear = opts.ceYear;
  const compareCeYear = opts.compareCeYear && opts.compareCeYear !== ceYear ? opts.compareCeYear : ceYear - 1;
  const includeCurrentMonth = opts.includeCurrentMonth === true;
  const throughMonth = Math.min(
    12,
    Math.max(1, opts.throughMonth && opts.throughMonth >= 1 && opts.throughMonth <= 12
      ? opts.throughMonth
      : defaultYtdThroughMonth(ceYear, includeCurrentMonth))
  );
  const filters = opts.filters ?? {};
  const currentVisible = ceYear > currentCeYear() ? 0 : ceYear < currentCeYear() ? 12 : throughMonth;
  const previousVisible = compareCeYear > currentCeYear() ? 0 : 12;

  const branchOnly = yearCompareFilterSql(5, { branch: filters.branch ?? null });
  const currentRange = ceYearRange(ceYear);
  const compareRange = ceYearRange(compareCeYear);
  const groupParams: unknown[] = [currentRange.from, currentRange.to, compareRange.from, compareRange.to, ...branchOnly.params];

  const [current, previous, availableBeYears, branchQ, groupQ, conversionNote] = await Promise.all([
    queryYearCompareSide(ceYear, throughMonth, currentVisible, filters),
    queryYearCompareSide(compareCeYear, throughMonth, previousVisible, filters),
    getAvailableBeYears(),
    getPool().query<{ branch_code: string }>(
      `SELECT DISTINCT i.branch_code
       FROM in_ticket_items i
       JOIN in_tickets t ON t.id = i.ticket_id
       WHERE t.is_deleted = FALSE AND t.status = 'paid' AND t.paid_timestamp IS NOT NULL
         AND i.branch_code IS NOT NULL
       ORDER BY 1`
    ),
    getPool().query<{ item_group: string | null }>(
      `SELECT DISTINCT i.item_group
       FROM in_ticket_items i
       JOIN in_tickets t ON t.id = i.ticket_id
       WHERE t.is_deleted = FALSE AND t.status = 'paid' AND t.paid_timestamp IS NOT NULL
         AND (
           (t.paid_timestamp >= $1 AND t.paid_timestamp < $2)
           OR (t.paid_timestamp >= $3 AND t.paid_timestamp < $4)
         )${branchOnly.sql}`,
      groupParams
    ),
    getTradeConversionNote("in", ytdRange(ceYear, throughMonth)),
  ]);

  const fromYears = groupQ.rows.map((row) => row.item_group ?? "");
  const allow = filters.itemGroups?.length ? new Set(filters.itemGroups) : null;
  const catKeys = [...new Set(allow ? [...allow] : fromYears)].sort((a, b) =>
    (a || "\uFFFF").localeCompare(b || "\uFFFF", "th", { numeric: true })
  );
  const categories: YearCompareCategory[] = catKeys.map((key) => {
    const cur = current.categories.get(key);
    const prev = previous.categories.get(key);
    const currentYtd = cur?.ytd ?? withTicketsPerCustomer({ tickets: 0, customers: 0, weightKg: 0, amount: 0 });
    const previousYtd = prev?.ytd ?? withTicketsPerCustomer({ tickets: 0, customers: 0, weightKg: 0, amount: 0 });
    return {
      itemGroup: key || null,
      nameTh: itemGroupName(key || null),
      current: currentYtd,
      previous: previousYtd,
      changePct: changeOf(currentYtd, previousYtd),
      currentMonths: cur?.months ?? monthSeries(new Map(), currentVisible === 0 ? 0 : currentVisible),
      previousMonths: prev?.months ?? monthSeries(new Map(), previousVisible === 0 ? 0 : previousVisible),
    };
  });

  const previousMissing = previous.monthsWithData.length === 0;

  return {
    side: "in",
    note: `ตั๋วอาจมีหลายรหัสสาขา — ตัวเลขนับจากรายการ ไม่ใช่เจ้าของตั๋ว · ลูกค้า = คนไม่ซ้ำในช่วง YTD ไม่ใช่ผลบวกรายเดือน · ${conversionNote}`,
    ceYear,
    beYear: toBuddhistYear(ceYear),
    compareCeYear,
    compareBeYear: toBuddhistYear(compareCeYear),
    throughMonth,
    includeCurrentMonth,
    branch: filters.branch ?? null,
    itemGroupsFilter: filters.itemGroups ?? [],
    lastPaidAt: current.lastPaidAt,
    previousMissing,
    completeness: {
      currentMonths: current.monthsWithData,
      previousMonths: previous.monthsWithData,
      currentLabel: completenessLabel(toBuddhistYear(ceYear), current.monthsWithData),
      previousLabel: completenessLabel(toBuddhistYear(compareCeYear), previous.monthsWithData),
    },
    kpis: {
      current: current.ytd,
      previous: previous.ytd,
      changePct: changeOf(current.ytd, previous.ytd),
    },
    monthly: {
      current: current.monthly,
      previous: previous.monthly,
    },
    categories,
    availableBeYears: availableBeYears.length ? availableBeYears : [toBuddhistYear(ceYear)],
    branches: branchQ.rows.map((row) => row.branch_code).sort((a, b) => a.localeCompare(b, "th", { numeric: true })),
    itemGroups: [...new Set(groupQ.rows.map((row) => row.item_group).filter((v): v is string => Boolean(v)))].sort((a, b) =>
      a.localeCompare(b, "th", { numeric: true })
    ),
  };
}
