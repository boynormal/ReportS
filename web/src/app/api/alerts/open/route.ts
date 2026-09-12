import { errorJson, json } from "@/lib/api";
import { getOpenTickets } from "@/lib/queries";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const sideRaw = url.searchParams.get("side");
    const side = sideRaw === "in" || sideRaw === "out" ? sideRaw : "all";
    const branch = url.searchParams.get("branch_code") || url.searchParams.get("branch");
    const itemGroup = url.searchParams.get("item_group");
    return json(
      await getOpenTickets({
        side,
        branch: branch && branch.length > 0 ? branch : null,
        itemGroup: itemGroup && itemGroup.length > 0 ? itemGroup : null,
      })
    );
  } catch (err) {
    return errorJson(err instanceof Error ? err.message : "query failed", 500);
  }
}
