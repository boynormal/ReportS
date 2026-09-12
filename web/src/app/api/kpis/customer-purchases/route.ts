import { errorJson, json } from "@/lib/api";
import { currentCeYear, fromBuddhistYear } from "@/lib/dates";
import { getCustomerPurchases } from "@/lib/queries";

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
    return json(
      await getCustomerPurchases(parseYear(url.searchParams.get("year") ?? url.searchParams.get("be")), {
        query: url.searchParams.get("q"),
        page: Number.isFinite(pageRaw) && pageRaw >= 1 ? Math.trunc(pageRaw) : 1,
      })
    );
  } catch (err) {
    return errorJson(err instanceof Error ? err.message : "query failed", 500);
  }
}
