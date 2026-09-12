import { errorJson } from "@/lib/api";
import { currentCeMonth, currentCeYear, fromBuddhistYear, rangeFromPreset, sqlDay } from "@/lib/dates";
import {
  exportCustomerMonths,
  exportCustomerReport,
  exportCustomers,
  exportLookup,
  exportOpenTickets,
  exportSalesProfit,
  exportSmallIn,
  exportStock,
  exportTradeSummary,
  exportTransforms,
  exportYearCompare,
} from "@/lib/export-workbooks";
import {
  getCustomerPurchases,
  getCustomerReport,
  getCustomerSales,
  getCustomers,
  getOpenTickets,
  getSalesProfit,
  getSmallInPurchases,
  getStock,
  getStockTransforms,
  getTradeLines,
  getTradeSummary,
  getYearCompare,
  lookupTicketsByNumber,
} from "@/lib/queries";
import { SMALL_IN_CAPS, type SmallInCap } from "@/lib/small-in-types";
import type { TradeSide } from "@/lib/trade-types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TABS = new Set([
  "in",
  "out",
  "profit",
  "small-in",
  "customers",
  "customer-report",
  "customer-buy",
  "customer-sell",
  "stock",
  "transform",
  "sales-profit",
  "open",
  "lookup",
  "yoy",
]);

function parseYear(raw: string | null): number {
  if (!raw) return currentCeYear();
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 2000) return currentCeYear();
  if (n >= 2500) return fromBuddhistYear(n);
  return Math.trunc(n);
}

function parseList(url: URL, keys: string[]): string[] {
  const values: string[] = [];
  for (const key of keys) {
    for (const raw of url.searchParams.getAll(key)) {
      values.push(...raw.split(","));
    }
  }
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

function parseSilent(raw: string | null): number | "never" | null {
  if (raw === "never" || raw === "-") return "never";
  if (raw && Number.isFinite(Number(raw))) return Number(raw);
  return null;
}

export async function GET(request: Request, ctx: { params: Promise<{ tab: string }> }) {
  try {
    const { tab } = await ctx.params;
    if (!TABS.has(tab)) return errorJson("ไม่รองรับหน้านี้", 400);
    const url = new URL(request.url);
    const ceYear = parseYear(url.searchParams.get("year") ?? url.searchParams.get("be"));
    const q = url.searchParams.get("q");
    const group = url.searchParams.get("group");
    const branch = url.searchParams.get("branch_code") || url.searchParams.get("branch");
    const itemGroup = url.searchParams.get("item_group");

    if (tab === "customers") {
      const silentRaw = url.searchParams.get("silent_days");
      const data = await getCustomers({
        ceYear,
        group,
        query: q,
        silentDays: parseSilent(silentRaw),
        all: true,
      });
      return exportCustomers(data, { query: q, silentDays: silentRaw });
    }

    if (tab === "customer-buy") {
      return exportCustomerMonths(await getCustomerPurchases(ceYear, { query: q, all: true }), "ซื้อเข้ารายลูกค้า");
    }

    if (tab === "customer-sell") {
      return exportCustomerMonths(await getCustomerSales(ceYear, { query: q, all: true }), "ขายออกรายลูกค้า");
    }

    if (tab === "in" || tab === "out" || tab === "profit") {
      const side = tab as TradeSide;
      const sellerId = url.searchParams.get("seller_id");
      const buyerId = url.searchParams.get("buyer_id");
      const filters = {
        branch: branch && branch.length > 0 ? branch : null,
        itemGroup: itemGroup && itemGroup.length > 0 ? itemGroup : null,
        sellerId: side === "in" && sellerId ? sellerId : null,
        buyerId: side === "out" && buyerId ? buyerId : null,
      };
      const summary = await getTradeSummary(ceYear, side, filters);
      const lines =
        side === "in" || side === "out"
          ? await getTradeLines(ceYear, side, {
              ...filters,
              sellerName: url.searchParams.get("seller"),
              buyerName: url.searchParams.get("buyer"),
              all: true,
            })
          : null;
      return exportTradeSummary(summary, lines);
    }

    if (tab === "small-in") {
      const capRaw = Number(url.searchParams.get("cap"));
      const cap: SmallInCap = (SMALL_IN_CAPS as readonly number[]).includes(capRaw) ? (capRaw as SmallInCap) : 10000;
      const branches = parseList(url, ["branches", "branch"]);
      const itemGroups = parseList(url, ["item_groups", "item_group"]);
      return exportSmallIn(
        await getSmallInPurchases(ceYear, cap, {
          branches: branches.length ? branches : undefined,
          itemGroups: itemGroups.length ? itemGroups : undefined,
        })
      );
    }

    if (tab === "customer-report") {
      return exportCustomerReport(await getCustomerReport({ ceYear, group }));
    }

    if (tab === "stock") {
      const fromParam = url.searchParams.get("from");
      const toParam = url.searchParams.get("to");
      return exportStock(
        await getStock({
          branch: branch && branch.length > 0 ? branch : null,
          itemGroup: itemGroup && itemGroup.length > 0 ? itemGroup : null,
          range: rangeFromPreset("custom", fromParam || sqlDay(new Date()), toParam || sqlDay(new Date())),
        })
      );
    }

    if (tab === "open") {
      const sideRaw = url.searchParams.get("open_side") || url.searchParams.get("side");
      const side = sideRaw === "in" || sideRaw === "out" ? sideRaw : "all";
      return exportOpenTickets(
        await getOpenTickets({
          side,
          branch: branch && branch.length > 0 ? branch : null,
          itemGroup: itemGroup && itemGroup.length > 0 ? itemGroup : null,
          all: true,
        })
      );
    }

    if (tab === "sales-profit") {
      return exportSalesProfit(
        await getSalesProfit({
          ceYear,
          branch: branch && branch.length > 0 ? branch : null,
          itemGroup: itemGroup && itemGroup.length > 0 ? itemGroup : null,
          buyerId: url.searchParams.get("buyer_id"),
          all: true,
        })
      );
    }

    if (tab === "transform") {
      const monthRaw = Number(url.searchParams.get("month"));
      const month =
        Number.isInteger(monthRaw) && monthRaw >= 1 && monthRaw <= 12
          ? monthRaw
          : ceYear === currentCeYear()
            ? currentCeMonth()
            : 12;
      return exportTransforms(
        await getStockTransforms({
          ceYear,
          month,
          branch: branch && branch.length > 0 ? branch : null,
          itemGroup: itemGroup && itemGroup.length > 0 ? itemGroup : null,
        })
      );
    }

    if (tab === "lookup") {
      if (!q || !q.trim()) return errorJson("ใส่เลขที่ตั๋วก่อนส่งออก", 400);
      return exportLookup(await lookupTicketsByNumber(q.trim()));
    }

    if (tab === "yoy") {
      const compareCe = parseYear(url.searchParams.get("compare") ?? String(ceYear - 1 + 543));
      const includeCurrent =
        url.searchParams.get("include_current") === "1" || url.searchParams.get("include_current") === "true";
      const throughRaw = Number(url.searchParams.get("through_month") ?? url.searchParams.get("through"));
      const throughMonth =
        Number.isInteger(throughRaw) && throughRaw >= 1 && throughRaw <= 12 ? throughRaw : undefined;
      const itemGroups = parseList(url, ["item_groups", "item_group"]);
      return exportYearCompare(
        await getYearCompare({
          ceYear,
          compareCeYear: compareCe,
          throughMonth,
          includeCurrentMonth: includeCurrent,
          filters: {
            branch: branch && branch.length > 0 ? branch : null,
            itemGroups: itemGroups.length ? itemGroups : undefined,
          },
        })
      );
    }

    return errorJson("ไม่รองรับหน้านี้", 400);
  } catch (err) {
    return errorJson(err instanceof Error ? err.message : "export failed", 500);
  }
}
