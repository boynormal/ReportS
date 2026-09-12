import { errorJson, json } from "@/lib/api";
import { currentCeYear, fromBuddhistYear } from "@/lib/dates";
import { getTradeSummary } from "@/lib/queries";
import type { TradeSide } from "@/lib/trade-types";

const SIDES = new Set<TradeSide>(["in", "out", "profit"]);

function parseYear(raw: string | null): number {
  if (!raw) return currentCeYear();
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 2000) return currentCeYear();
  if (n >= 2500) return fromBuddhistYear(n);
  return Math.trunc(n);
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const sideRaw = url.searchParams.get("side") || "in";
    if (!SIDES.has(sideRaw as TradeSide)) {
      return errorJson("side ต้องเป็น in, out หรือ profit", 400);
    }
    const ceYear = parseYear(url.searchParams.get("year") ?? url.searchParams.get("be"));
    const branch = url.searchParams.get("branch_code") || url.searchParams.get("branch");
    const itemGroup = url.searchParams.get("item_group");
    const sellerId = url.searchParams.get("seller_id");
    const buyerId = url.searchParams.get("buyer_id");
    const side = sideRaw as TradeSide;
    return json(
      await getTradeSummary(ceYear, side, {
        branch: branch && branch.length > 0 ? branch : null,
        itemGroup: itemGroup && itemGroup.length > 0 ? itemGroup : null,
        sellerId: side === "in" && sellerId && sellerId.length > 0 ? sellerId : null,
        buyerId: side === "out" && buyerId && buyerId.length > 0 ? buyerId : null,
      })
    );
  } catch (err) {
    return errorJson(err instanceof Error ? err.message : "query failed", 500);
  }
}
