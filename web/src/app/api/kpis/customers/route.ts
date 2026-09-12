import { errorJson, json } from "@/lib/api";
import { currentCeYear, fromBuddhistYear } from "@/lib/dates";
import { getCustomers } from "@/lib/queries";

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
    const silentRaw = url.searchParams.get("silent_days");
    const silentDays =
      silentRaw === "never" || silentRaw === "-"
        ? "never"
        : silentRaw && Number.isFinite(Number(silentRaw))
          ? Number(silentRaw)
          : null;
    const pageRaw = Number(url.searchParams.get("page"));
    return json(
      await getCustomers({
        ceYear: parseYear(url.searchParams.get("year") ?? url.searchParams.get("be")),
        group: url.searchParams.get("group"),
        query: url.searchParams.get("q"),
        silentDays,
        page: Number.isFinite(pageRaw) && pageRaw >= 1 ? Math.trunc(pageRaw) : 1,
      })
    );
  } catch (err) {
    return errorJson(err instanceof Error ? err.message : "query failed", 500);
  }
}
