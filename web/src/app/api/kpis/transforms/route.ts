import { errorJson, json } from "@/lib/api";
import { currentCeMonth, currentCeYear, fromBuddhistYear } from "@/lib/dates";
import { getStockTransforms } from "@/lib/queries";

function parseYear(raw: string | null): number {
  if (!raw) return currentCeYear();
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 2000) return currentCeYear();
  if (n >= 2500) return fromBuddhistYear(n);
  return Math.trunc(n);
}

function parseMonth(raw: string | null, ceYear: number): number {
  const n = Number(raw);
  if (Number.isInteger(n) && n >= 1 && n <= 12) return n;
  return ceYear === currentCeYear() ? currentCeMonth() : 12;
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const ceYear = parseYear(url.searchParams.get("year") ?? url.searchParams.get("be"));
    const branch = url.searchParams.get("branch_code") || url.searchParams.get("branch");
    const itemGroup = url.searchParams.get("item_group");
    return json(
      await getStockTransforms({
        ceYear,
        month: parseMonth(url.searchParams.get("month"), ceYear),
        branch: branch && branch.length > 0 ? branch : null,
        itemGroup: itemGroup && itemGroup.length > 0 ? itemGroup : null,
      })
    );
  } catch (err) {
    return errorJson(err instanceof Error ? err.message : "query failed", 500);
  }
}
