import { errorJson, json } from "@/lib/api";
import { currentCeYear, fromBuddhistYear } from "@/lib/dates";
import { getCustomerReport } from "@/lib/queries";

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
    return json(
      await getCustomerReport({
        ceYear: parseYear(url.searchParams.get("year") ?? url.searchParams.get("be")),
        group: url.searchParams.get("group"),
      })
    );
  } catch (err) {
    return errorJson(err instanceof Error ? err.message : "query failed", 500);
  }
}
