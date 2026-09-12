import { errorJson, json } from "@/lib/api";
import { searchSellers } from "@/lib/queries";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const id = url.searchParams.get("id");
    const query = url.searchParams.get("q");
    return json({ rows: await searchSellers({ id, query }) });
  } catch (err) {
    return errorJson(err instanceof Error ? err.message : "query failed", 500);
  }
}
