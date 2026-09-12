import { errorJson, json } from "@/lib/api";
import { lookupTicketsByNumber } from "@/lib/queries";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const q = (url.searchParams.get("q") ?? "").trim();
    if (!q) return errorJson("กรุณาใส่เลขที่ตั๋ว", 400);
    if (q.length > 40) return errorJson("เลขที่ตั๋วยาวเกินกำหนด", 400);
    return json(await lookupTicketsByNumber(q));
  } catch (err) {
    return errorJson(err instanceof Error ? err.message : "query failed", 500);
  }
}
