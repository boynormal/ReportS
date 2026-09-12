import { errorJson, json } from "@/lib/api";
import { rangeFromPreset, sqlDay } from "@/lib/dates";
import { getStock } from "@/lib/queries";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const branch = url.searchParams.get("branch_code") || url.searchParams.get("branch");
    const itemGroup = url.searchParams.get("item_group");
    const fromParam = url.searchParams.get("from");
    const toParam = url.searchParams.get("to");
    const today = sqlDay(new Date());
    const range = rangeFromPreset(
      "custom",
      fromParam || today,
      toParam || today
    );
    return json(
      await getStock({
        branch: branch && branch.length > 0 ? branch : null,
        itemGroup: itemGroup && itemGroup.length > 0 ? itemGroup : null,
        range,
      })
    );
  } catch (err) {
    return errorJson(err instanceof Error ? err.message : "query failed", 500);
  }
}
