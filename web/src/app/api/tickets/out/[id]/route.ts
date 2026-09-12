import { errorJson, json } from "@/lib/api";
import { getOutTicket } from "@/lib/queries";

export async function GET(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    const ticket = await getOutTicket(id);
    if (!ticket) return errorJson("ไม่พบตั๋วขาย", 404);
    return json(ticket);
  } catch (err) {
    return errorJson(err instanceof Error ? err.message : "query failed", 500);
  }
}
