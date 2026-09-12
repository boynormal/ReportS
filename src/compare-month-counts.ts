/**
 * Compare monthly ticket counts: Firestore vs Postgres
 * Buy tickets use paidTimestamp; sell tickets use paidAt (Asia/Bangkok months)
 *
 * Requires: SCRAPEE_EMAIL, SCRAPEE_PASSWORD, DATABASE_URL, START_DATE, END_DATE
 */

import "dotenv/config";
import {
  countOutTicketsByPaidRange,
  countTicketsByPaidRange,
  loginScrapee,
} from "./lib/firebase.js";
import {
  closePool,
  countActiveOutTicketsByPaidRange,
  countActiveTicketsByPaidRange,
} from "./lib/postgres.js";
import { eachMonthInRange } from "./lib/transform.js";

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) {
    throw new Error(`กรุณาตั้งค่า ${name} ใน environment / .env`);
  }
  return v;
}

function cell(value: number | string, width: number): string {
  return String(value).padStart(width);
}

async function main(): Promise<void> {
  const hasToken =
    Boolean(process.env.SCRAPEE_ID_TOKEN?.trim()) ||
    Boolean(process.env.SCRAPEE_REFRESH_TOKEN?.trim());
  const email = hasToken
    ? process.env.SCRAPEE_EMAIL?.trim() || "token-auth@local"
    : requireEnv("SCRAPEE_EMAIL");
  const password = hasToken
    ? process.env.SCRAPEE_PASSWORD?.trim() || ""
    : requireEnv("SCRAPEE_PASSWORD");
  requireEnv("DATABASE_URL");
  const startDate = requireEnv("START_DATE");
  const endDate = requireEnv("END_DATE");

  if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate) || !/^\d{4}-\d{2}-\d{2}$/.test(endDate)) {
    throw new Error("START_DATE / END_DATE ต้องเป็นรูปแบบ YYYY-MM-DD");
  }

  const session = await loginScrapee(email, password);
  console.log("companyId:", session.companyId);
  console.log(`ช่วง ${startDate} .. ${endDate} (ซื้อ=paidTimestamp, ขาย=paidAt, เดือน Asia/Bangkok)\n`);

  const header = [
    "month".padEnd(10),
    cell("buy_fs", 8),
    cell("buy_pg", 8),
    cell("buy_d", 6),
    cell("sell_fs", 8),
    cell("sell_pg", 8),
    cell("sell_d", 6),
  ].join("  ");
  console.log(header);
  console.log("-".repeat(header.length));

  let totalBuyFs = 0;
  let totalBuyPg = 0;
  let totalSellFs = 0;
  let totalSellPg = 0;
  let mismatchMonths = 0;

  for (const m of eachMonthInRange(startDate, endDate)) {
    const buyFs = await countTicketsByPaidRange(session, m.start, m.end);
    const buyPg = await countActiveTicketsByPaidRange(session.companyId, m.start, m.end);
    const sellFs = await countOutTicketsByPaidRange(session, m.start, m.end);
    const sellPg = await countActiveOutTicketsByPaidRange(session.companyId, m.start, m.end);
    const sellFsN = sellFs ?? 0;
    const buyDiff = buyPg - buyFs;
    const sellDiff = sellPg - sellFsN;
    totalBuyFs += buyFs;
    totalBuyPg += buyPg;
    totalSellFs += sellFsN;
    totalSellPg += sellPg;
    if (buyDiff !== 0 || (sellFs !== null && sellDiff !== 0)) mismatchMonths += 1;

    console.log(
      [
        m.label.padEnd(10),
        cell(buyFs, 8),
        cell(buyPg, 8),
        cell(buyDiff, 6),
        cell(sellFs === null ? "-" : sellFsN, 8),
        cell(sellPg, 8),
        cell(sellFs === null ? "-" : sellDiff, 6),
      ].join("  ")
    );
  }

  console.log("-".repeat(header.length));
  console.log(
    [
      "TOTAL".padEnd(10),
      cell(totalBuyFs, 8),
      cell(totalBuyPg, 8),
      cell(totalBuyPg - totalBuyFs, 6),
      cell(totalSellFs, 8),
      cell(totalSellPg, 8),
      cell(totalSellPg - totalSellFs, 6),
    ].join("  ")
  );
  console.log(`\nเดือนที่จำนวนไม่ตรง: ${mismatchMonths} (diff = postgres - firestore)`);
}

main()
  .catch((err) => {
    console.error("เกิดข้อผิดพลาด:", err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closePool();
  });
