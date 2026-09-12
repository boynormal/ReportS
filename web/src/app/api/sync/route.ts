import { errorJson, json } from "@/lib/api";
import { readSessionFromRequest } from "@/lib/auth";
import { writeDashboardLog } from "@/lib/dashboard-logs";
import { getSyncStatus } from "@/lib/queries";
import {
  AUTH_SYNC_LOCK_MS,
  clearSyncStarting,
  isSyncStarting,
  markSyncStarting,
  startIncrementalSync,
} from "@/lib/sync-job";

export async function POST(request: Request) {
  try {
    if (isSyncStarting()) {
      return errorJson("กำลังอัปเดทอยู่แล้ว", 409);
    }
    const status = await getSyncStatus();
    if (status.running) {
      return errorJson("กำลังอัปเดทอยู่แล้ว", 409);
    }
    markSyncStarting(AUTH_SYNC_LOCK_MS);
    try {
      await startIncrementalSync();
    } catch (err) {
      clearSyncStarting();
      throw err;
    }
    const session = await readSessionFromRequest(request);
    await writeDashboardLog({
      lineUserId: session?.lineUserId,
      displayName: session?.name,
      role: session?.role,
      action: "sync",
      label: "กดซิงก์ข้อมูล",
    });
    return json({ started: true, running: true }, 202);
  } catch (err) {
    return errorJson(err instanceof Error ? err.message : "start sync failed", 500);
  }
}
