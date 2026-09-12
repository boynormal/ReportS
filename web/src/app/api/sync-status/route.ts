import { errorJson, json } from "@/lib/api";
import { getSyncStatus } from "@/lib/queries";
import { isSyncStarting } from "@/lib/sync-job";

export async function GET() {
  try {
    const status = await getSyncStatus();
    return json({ ...status, running: status.running || isSyncStarting() });
  } catch (err) {
    return errorJson(err instanceof Error ? err.message : "query failed", 500);
  }
}
