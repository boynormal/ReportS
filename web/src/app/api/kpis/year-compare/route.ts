import { errorJson, json } from "@/lib/api";
import { currentCeYear, defaultYtdThroughMonth, fromBuddhistYear } from "@/lib/dates";
import { getYearCompare } from "@/lib/queries";

function parseYear(raw: string | null, fallback: number): number {
  if (!raw) return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 2000) return fallback;
  if (n >= 2500) return fromBuddhistYear(n);
  return Math.trunc(n);
}

function parseList(raw: string | null): string[] {
  if (!raw) return [];
  return [...new Set(raw.split(",").map((v) => v.trim()).filter(Boolean))];
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const ceYear = parseYear(url.searchParams.get("year") ?? url.searchParams.get("be"), currentCeYear());
    const compareRaw = url.searchParams.get("compare");
    const compareCeYear = compareRaw ? parseYear(compareRaw, ceYear - 1) : ceYear - 1;
    const includeCurrentMonth =
      url.searchParams.get("include_current") === "1" || url.searchParams.get("include_current") === "true";
    const throughRaw = Number(url.searchParams.get("through_month") ?? url.searchParams.get("through"));
    const throughMonth =
      Number.isInteger(throughRaw) && throughRaw >= 1 && throughRaw <= 12
        ? throughRaw
        : defaultYtdThroughMonth(ceYear, includeCurrentMonth);
    const branchRaw = url.searchParams.get("branch_code") || url.searchParams.get("branch");
    const branch = branchRaw && branchRaw.length > 0 ? branchRaw : null;
    const itemGroups = parseList(url.searchParams.get("item_groups") || url.searchParams.get("item_group"));
    return json(
      await getYearCompare({
        ceYear,
        compareCeYear,
        throughMonth,
        includeCurrentMonth,
        filters: {
          branch,
          itemGroups: itemGroups.length ? itemGroups : undefined,
        },
      })
    );
  } catch (err) {
    return errorJson(err instanceof Error ? err.message : "query failed", 500);
  }
}
