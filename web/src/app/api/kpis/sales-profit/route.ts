import { errorJson, json } from "@/lib/api";
import { currentCeYear, fromBuddhistYear } from "@/lib/dates";
import { getSalesProfit } from "@/lib/queries";

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
    const pageRaw = Number(url.searchParams.get("page"));
    const branch = url.searchParams.get("branch_code") || url.searchParams.get("branch");
    const itemGroup = url.searchParams.get("item_group");
    return json(
      await getSalesProfit({
        ceYear: parseYear(url.searchParams.get("year") ?? url.searchParams.get("be")),
        branch: branch && branch.length > 0 ? branch : null,
        itemGroup: itemGroup && itemGroup.length > 0 ? itemGroup : null,
        buyerId: url.searchParams.get("buyer_id"),
        page: Number.isFinite(pageRaw) && pageRaw >= 1 ? Math.trunc(pageRaw) : 1,
      })
    );
  } catch (err) {
    return errorJson(err instanceof Error ? err.message : "query failed", 500);
  }
}
