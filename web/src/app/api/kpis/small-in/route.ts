import { errorJson, json } from "@/lib/api";
import { currentCeYear, fromBuddhistYear } from "@/lib/dates";
import { SMALL_IN_CAPS, type SmallInCap } from "@/lib/small-in-types";
import { getSmallInPurchases } from "@/lib/queries";

function parseYear(raw: string | null): number {
  if (!raw) return currentCeYear();
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 2000) return currentCeYear();
  if (n >= 2500) return fromBuddhistYear(n);
  return Math.trunc(n);
}

function parseCap(raw: string | null): SmallInCap {
  const n = Number(raw);
  return (SMALL_IN_CAPS as readonly number[]).includes(n) ? (n as SmallInCap) : 10000;
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

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const ceYear = parseYear(url.searchParams.get("year") ?? url.searchParams.get("be"));
    const cap = parseCap(url.searchParams.get("cap"));
    const branches = parseList(url, ["branches", "branch"]);
    const itemGroups = parseList(url, ["item_groups", "item_group"]);
    return json(
      await getSmallInPurchases(ceYear, cap, {
        branches: branches.length ? branches : undefined,
        itemGroups: itemGroups.length ? itemGroups : undefined,
      })
    );
  } catch (err) {
    return errorJson(err instanceof Error ? err.message : "query failed", 500);
  }
}
