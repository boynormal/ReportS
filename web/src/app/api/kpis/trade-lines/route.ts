import { errorJson, json } from "@/lib/api";
import { currentCeYear, fromBuddhistYear } from "@/lib/dates";
import { getTradeLines } from "@/lib/queries";

function parseYear(raw: string | null): number {
  if (!raw) return currentCeYear();
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 2000) return currentCeYear();
  if (n >= 2500) return fromBuddhistYear(n);
  return Math.trunc(n);
}

function parseMonth(raw: string | null): number | null {
  if (!raw) return null;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 1 || n > 12) return null;
  return n;
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const side = url.searchParams.get("side") || "in";
    if (side !== "in" && side !== "out") {
      return errorJson("side ต้องเป็น in หรือ out", 400);
    }
    const ceYear = parseYear(url.searchParams.get("year") ?? url.searchParams.get("be"));
    const page = Number(url.searchParams.get("page") || "1");
    return json(
      await getTradeLines(ceYear, side, {
        branch: url.searchParams.get("branch_code") || url.searchParams.get("branch"),
        itemGroup: url.searchParams.get("item_group"),
        sellerId: url.searchParams.get("seller_id"),
        sellerName: url.searchParams.get("seller"),
        buyerId: url.searchParams.get("buyer_id"),
        buyerName: url.searchParams.get("buyer"),
        month: parseMonth(url.searchParams.get("month")),
        page: Number.isFinite(page) ? page : 1,
      })
    );
  } catch (err) {
    return errorJson(err instanceof Error ? err.message : "query failed", 500);
  }
}
