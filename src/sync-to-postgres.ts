/**
 * Sync Scrapee collections → PostgreSQL
 *
 * Modes (MODE env):
 *   bootstrap         — tickets by month in START_DATE..END_DATE + master data
 *   incremental       — fetch by updatedAt lookback (LOOKBACK_DAYS, default 3)
 *   reconcile-month   — fetch by month, upsert, soft-delete missing ids
 *
 * Also syncs: sellers, products, customerGroups, outTickets, transforms, employees
 * Open tickets: extra createdAt pass (OPEN_LOOKBACK_DAYS, default 90)
 * Does not sync: PO, lock-price, ATM
 */

import { loadRootEnv } from "./lib/env-file.js";
import {
  fetchAllCustomerGroups,
  fetchAllEmployees,
  fetchAllProducts,
  fetchAllSellers,
  fetchOutTicketsByCreatedRange,
  fetchOutTicketsByPaidRange,
  fetchOutTicketsUpdatedSince,
  fetchTicketsByCreatedRange,
  fetchTicketsByPaidRange,
  fetchTicketsUpdatedSince,
  fetchTransformsByCreatedRange,
  fetchTransformsCreatedSince,
  loginScrapee,
  type ScrapeeSession,
} from "./lib/firebase.js";
import {
  closePool,
  finishSyncRun,
  seedEmployeesFromTicketUids,
  setSyncState,
  softDeleteMissingOutTickets,
  softDeleteMissingTickets,
  softDeleteMissingTransforms,
  startSyncRun,
  upsertCustomerGroups,
  upsertEmployees,
  upsertOutTickets,
  upsertProducts,
  upsertSellers,
  upsertStockTransforms,
  upsertTickets,
} from "./lib/postgres.js";
import {
  eachMonthInRange,
  isOpenInTicket,
  isOpenOutTicket,
} from "./lib/transform.js";

type Mode = "bootstrap" | "incremental" | "reconcile-month";

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) {
    throw new Error(`กรุณาตั้งค่า ${name} ใน environment / .env`);
  }
  return v;
}

function parseMode(raw: string | undefined): Mode {
  const mode = (raw ?? "incremental").toLowerCase() as Mode;
  if (mode !== "bootstrap" && mode !== "incremental" && mode !== "reconcile-month") {
    throw new Error(
      `MODE ไม่ถูกต้อง: ${raw} (ใช้ bootstrap | incremental | reconcile-month)`
    );
  }
  return mode;
}

function requireDateRange(): { startDate: string; endDate: string } {
  const startDate = requireEnv("START_DATE");
  const endDate = requireEnv("END_DATE");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate) || !/^\d{4}-\d{2}-\d{2}$/.test(endDate)) {
    throw new Error("START_DATE / END_DATE ต้องเป็นรูปแบบ YYYY-MM-DD");
  }
  if (startDate > endDate) {
    throw new Error("START_DATE ต้องไม่มากกว่า END_DATE");
  }
  return { startDate, endDate };
}

function parsePositiveDays(raw: string | undefined, fallback: number, name: string): number {
  const value = Number(raw ?? fallback);
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${name} ต้องเป็นตัวเลขมากกว่า 0`);
  }
  return value;
}

async function syncMasters(session: ScrapeeSession): Promise<{
  sellers: number;
  products: number;
  customerGroups: number;
  employees: number;
}> {
  console.log("\n[master] sync sellers ...");
  const sellers = await fetchAllSellers(session);
  await upsertSellers(sellers);
  console.log(`  sellers ${sellers.length}`);

  console.log("[master] sync products ...");
  const products = await fetchAllProducts(session);
  const productCount = products ? await upsertProducts(products) : 0;
  console.log(products ? `  products ${productCount}` : "  products ข้าม");

  console.log("[master] sync customerGroups ...");
  const groups = await fetchAllCustomerGroups(session);
  const groupCount = groups ? await upsertCustomerGroups(groups) : 0;
  console.log(groups ? `  customerGroups ${groupCount}` : "  customerGroups ข้าม");

  console.log("[master] sync employees ...");
  const employees = await fetchAllEmployees(session);
  const employeeCount = employees ? await upsertEmployees(employees) : 0;
  console.log(employees ? `  employees ${employeeCount}` : "  employees ข้าม");

  return {
    sellers: sellers.length,
    products: productCount,
    customerGroups: groupCount,
    employees: employeeCount,
  };
}

async function syncOpenTicketsInRange(
  session: ScrapeeSession,
  start: Date,
  end: Date,
  label: string
): Promise<{ fetched: number; upserted: number }> {
  console.log(`\n[${label}] ดึงตั๋วเปิด createdAt ${start.toISOString()} .. ${end.toISOString()}`);
  const tickets = await fetchTicketsByCreatedRange(session, start, end);
  const openIn = tickets.filter(isOpenInTicket);
  console.log(`  inTickets created=${tickets.length} open=${openIn.length}`);
  let upserted = await upsertTickets(openIn);

  const outTickets = await fetchOutTicketsByCreatedRange(session, start, end);
  if (outTickets) {
    const openOut = outTickets.filter(isOpenOutTicket);
    console.log(`  outTickets created=${outTickets.length} open=${openOut.length}`);
    upserted += await upsertOutTickets(openOut);
  }

  return {
    fetched: tickets.length + (outTickets?.length ?? 0),
    upserted,
  };
}

async function syncOpenTicketsByMonths(
  session: ScrapeeSession,
  startDate: string,
  endDate: string,
  label: string
): Promise<{ fetched: number; upserted: number }> {
  let fetched = 0;
  let upserted = 0;
  for (const m of eachMonthInRange(startDate, endDate)) {
    const part = await syncOpenTicketsInRange(session, m.start, m.end, `${label} open ${m.label}`);
    fetched += part.fetched;
    upserted += part.upserted;
  }
  return { fetched, upserted };
}

function bangkokDateStr(date: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Bangkok",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

async function runBootstrap(email: string, password: string): Promise<void> {
  const { startDate, endDate } = requireDateRange();
  const session = await loginScrapee(email, password);
  console.log("เข้าสู่ระบบสำเร็จ, uid:", session.uid, "companyId:", session.companyId);

  const months = [...eachMonthInRange(startDate, endDate)];
  const rangeStart = months[0]?.start ?? null;
  const rangeEnd = months[months.length - 1]?.end ?? null;
  const runId = await startSyncRun({
    mode: "bootstrap",
    companyId: session.companyId,
    rangeStart,
    rangeEnd,
  });

  let fetched = 0;
  let upserted = 0;
  let softDeleted = 0;

  try {
    for (const m of months) {
      console.log(`\n[bootstrap] ดึงเดือน ${m.label} ...`);
      const tickets = await fetchTicketsByPaidRange(session, m.start, m.end);
      console.log(`  inTickets ${tickets.length}`);
      fetched += tickets.length;
      upserted += await upsertTickets(tickets);

      const outTickets = await fetchOutTicketsByPaidRange(session, m.start, m.end);
      if (outTickets) {
        console.log(`  outTickets ${outTickets.length}`);
        fetched += outTickets.length;
        upserted += await upsertOutTickets(outTickets);
      }

      const transforms = await fetchTransformsByCreatedRange(session, m.start, m.end);
      if (transforms) {
        console.log(`  transforms ${transforms.length}`);
        fetched += transforms.length;
        upserted += await upsertStockTransforms(transforms);
      }
    }

    const open = await syncOpenTicketsByMonths(session, startDate, endDate, "bootstrap");
    fetched += open.fetched;
    upserted += open.upserted;

    const masters = await syncMasters(session);
    fetched += masters.sellers + masters.products + masters.customerGroups + masters.employees;
    upserted += masters.sellers + masters.products + masters.customerGroups + masters.employees;
    const seeded = await seedEmployeesFromTicketUids();
    console.log(`  employees seed UIDs ${seeded}`);

    await setSyncState(`inTickets:${session.companyId}`, new Date(), {
      mode: "bootstrap",
      startDate,
      endDate,
    });

    await finishSyncRun(runId, { fetched, upserted, softDeleted });
    console.log(
      `\nเสร็จ bootstrap — fetched=${fetched} upserted=${upserted} sellers=${masters.sellers} products=${masters.products} groups=${masters.customerGroups} employees=${masters.employees}`
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await finishSyncRun(runId, { fetched, upserted, softDeleted, error: message });
    throw err;
  }
}

async function runIncremental(email: string, password: string): Promise<void> {
  const lookbackDays = parsePositiveDays(process.env.LOOKBACK_DAYS, 3, "LOOKBACK_DAYS");
  const openLookbackDays = parsePositiveDays(
    process.env.OPEN_LOOKBACK_DAYS,
    90,
    "OPEN_LOOKBACK_DAYS"
  );

  const session = await loginScrapee(email, password);
  console.log("เข้าสู่ระบบสำเร็จ, uid:", session.uid, "companyId:", session.companyId);

  const since = new Date(Date.now() - lookbackDays * 24 * 60 * 60 * 1000);
  const runId = await startSyncRun({
    mode: "incremental",
    companyId: session.companyId,
    rangeStart: since,
    rangeEnd: new Date(),
  });

  let fetched = 0;
  let upserted = 0;

  try {
    console.log(`\n[incremental] ดึง updatedAt >= ${since.toISOString()} (lookback ${lookbackDays} วัน)`);
    const tickets = await fetchTicketsUpdatedSince(session, since);
    console.log(`  inTickets ${tickets.length}`);
    fetched += tickets.length;
    upserted += await upsertTickets(tickets);

    const outTickets = await fetchOutTicketsUpdatedSince(session, since);
    if (outTickets) {
      console.log(`  outTickets ${outTickets.length}`);
      fetched += outTickets.length;
      upserted += await upsertOutTickets(outTickets);
    }

    const transforms = await fetchTransformsCreatedSince(session, since);
    if (transforms) {
      console.log(`  transforms ${transforms.length}`);
      fetched += transforms.length;
      upserted += await upsertStockTransforms(transforms);
    }

    const openSince = new Date(Date.now() - openLookbackDays * 24 * 60 * 60 * 1000);
    const open = await syncOpenTicketsByMonths(
      session,
      bangkokDateStr(openSince),
      bangkokDateStr(new Date()),
      `incremental open lookback ${openLookbackDays}d`
    );
    fetched += open.fetched;
    upserted += open.upserted;

    const masters = await syncMasters(session);
    fetched += masters.sellers + masters.products + masters.customerGroups + masters.employees;
    upserted += masters.sellers + masters.products + masters.customerGroups + masters.employees;
    const seeded = await seedEmployeesFromTicketUids();
    console.log(`  employees seed UIDs ${seeded}`);

    let maxUpdated: Date | null = since;
    for (const t of tickets) {
      if (t.updatedAt && (!maxUpdated || t.updatedAt > maxUpdated)) {
        maxUpdated = t.updatedAt;
      }
    }
    if (outTickets) {
      for (const t of outTickets) {
        if (t.updatedAt && (!maxUpdated || t.updatedAt > maxUpdated)) {
          maxUpdated = t.updatedAt;
        }
      }
    }

    await setSyncState(`inTickets:${session.companyId}`, maxUpdated, {
      mode: "incremental",
      lookbackDays,
    });

    await finishSyncRun(runId, { fetched, upserted, softDeleted: 0 });
    console.log(`\nเสร็จ incremental — fetched=${fetched} upserted=${upserted}`);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await finishSyncRun(runId, { fetched, upserted, softDeleted: 0, error: message });
    throw err;
  }
}

async function runReconcileMonth(email: string, password: string): Promise<void> {
  const { startDate, endDate } = requireDateRange();
  const session = await loginScrapee(email, password);
  console.log("เข้าสู่ระบบสำเร็จ, uid:", session.uid, "companyId:", session.companyId);

  const months = [...eachMonthInRange(startDate, endDate)];
  const rangeStart = months[0]?.start ?? null;
  const rangeEnd = months[months.length - 1]?.end ?? null;
  const runId = await startSyncRun({
    mode: "reconcile-month",
    companyId: session.companyId,
    rangeStart,
    rangeEnd,
  });

  let fetched = 0;
  let upserted = 0;
  let softDeleted = 0;

  try {
    for (const m of months) {
      console.log(`\n[reconcile-month] เดือน ${m.label} ...`);
      const tickets = await fetchTicketsByPaidRange(session, m.start, m.end);
      console.log(`  inTickets ${tickets.length}`);
      fetched += tickets.length;
      upserted += await upsertTickets(tickets);
      const deletedIn = await softDeleteMissingTickets(
        session.companyId,
        m.start,
        m.end,
        new Set(tickets.map((t) => t.id))
      );
      softDeleted += deletedIn;
      console.log(`  inTickets soft-deleted: ${deletedIn}`);

      const outTickets = await fetchOutTicketsByPaidRange(session, m.start, m.end);
      if (outTickets) {
        console.log(`  outTickets ${outTickets.length}`);
        fetched += outTickets.length;
        upserted += await upsertOutTickets(outTickets);
        const deletedOut = await softDeleteMissingOutTickets(
          session.companyId,
          m.start,
          m.end,
          new Set(outTickets.map((t) => t.id))
        );
        softDeleted += deletedOut;
        console.log(`  outTickets soft-deleted: ${deletedOut}`);
      }

      const transforms = await fetchTransformsByCreatedRange(session, m.start, m.end);
      if (transforms) {
        console.log(`  transforms ${transforms.length}`);
        fetched += transforms.length;
        upserted += await upsertStockTransforms(transforms);
        const deletedTf = await softDeleteMissingTransforms(
          session.companyId,
          m.start,
          m.end,
          new Set(transforms.map((t) => t.id))
        );
        softDeleted += deletedTf;
        console.log(`  transforms soft-deleted: ${deletedTf}`);
      }
    }

    const open = await syncOpenTicketsByMonths(session, startDate, endDate, "reconcile-month");
    fetched += open.fetched;
    upserted += open.upserted;

    const masters = await syncMasters(session);
    fetched += masters.sellers + masters.products + masters.customerGroups + masters.employees;
    upserted += masters.sellers + masters.products + masters.customerGroups + masters.employees;
    const seeded = await seedEmployeesFromTicketUids();
    console.log(`  employees seed UIDs ${seeded}`);

    await setSyncState(`inTickets:${session.companyId}`, new Date(), {
      mode: "reconcile-month",
      startDate,
      endDate,
    });

    await finishSyncRun(runId, { fetched, upserted, softDeleted });
    console.log(
      `\nเสร็จ reconcile-month — fetched=${fetched} upserted=${upserted} soft_deleted=${softDeleted}`
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await finishSyncRun(runId, { fetched, upserted, softDeleted, error: message });
    throw err;
  }
}

function resolveAuthEnv(): { email: string; password: string } {
  const hasToken =
    Boolean(process.env.SCRAPEE_ID_TOKEN?.trim()) ||
    Boolean(process.env.SCRAPEE_REFRESH_TOKEN?.trim());
  const email = process.env.SCRAPEE_EMAIL?.trim() || "token-auth@local";
  if (hasToken) {
    return { email, password: process.env.SCRAPEE_PASSWORD?.trim() || "" };
  }
  return {
    email: requireEnv("SCRAPEE_EMAIL"),
    password: requireEnv("SCRAPEE_PASSWORD"),
  };
}

async function main(): Promise<void> {
  loadRootEnv({ override: true });
  const mode = parseMode(process.env.MODE);
  const { email, password } = resolveAuthEnv();
  requireEnv("DATABASE_URL");

  console.log(`MODE=${mode}`);

  if (mode === "bootstrap") {
    await runBootstrap(email, password);
  } else if (mode === "incremental") {
    await runIncremental(email, password);
  } else {
    await runReconcileMonth(email, password);
  }
}

main()
  .catch((err) => {
    console.error("เกิดข้อผิดพลาด:", err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closePool();
  });
