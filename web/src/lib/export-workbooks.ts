import { THAI_MONTHS_SHORT } from "./dates";
import { addSheet, createWorkbook, excelDay, exportFileName, xlsxResponse, type ExcelCell } from "./excel";
import type { CustomerPurchasesResult } from "./customer-purchase-types";
import type { CustomerReportKind, CustomerReportPerson, CustomerReportResult } from "./customer-report-types";
import type { CustomersResult } from "./customer-types";
import type { SmallInResult } from "./small-in-types";
import type { StockResult } from "./stock-types";
import type { OpenTicketsResult } from "./ticket-open-types";
import type { TicketLookupResult } from "./ticket-lookup-types";
import type { SalesProfitResult } from "./sales-profit-types";
import type { StockTransformsResult } from "./transform-types";
import type { TradeLinesResult, TradeSummary } from "./trade-types";

const REPORT_LISTS: Array<{ kind: CustomerReportKind; label: string }> = [
  { kind: "new", label: "ลูกค้าใหม่" },
  { kind: "lost", label: "ลูกค้าที่หาย" },
  { kind: "retained", label: "ลูกค้าเดิมที่ยังอยู่" },
  { kind: "returned", label: "ลูกค้ากลับมา" },
];

function monthHeaders(): string[] {
  return [...THAI_MONTHS_SHORT];
}

function personRows(rows: CustomerReportPerson[]): ExcelCell[][] {
  return rows.map((row) => [
    row.name,
    row.group,
    row.tel,
    row.code,
    excelDay(row.lastPaidAt),
    row.tickets,
    row.amount,
  ]);
}

function formatUnit(unit: string | null): string {
  if (!unit) return "";
  if (unit === "unit_kilogram") return "กก.";
  return unit.startsWith("unit_") ? unit.slice(5) : unit;
}

function avgPaid(amount: number, weight: number): number | "" {
  return weight > 0 ? amount / weight : "";
}

export async function exportCustomers(data: CustomersResult, extras?: { query?: string | null; silentDays?: string | null }) {
  const wb = createWorkbook();
  addSheet(wb, "สรุป", ["รายการ", "จำนวน"], [
    ["ลูกค้าในช่วงตัวกรอง", data.total],
    ["หายเกิน 30 วัน", data.silentCounts[30]],
    ["หายเกิน 60 วัน", data.silentCounts[60]],
    ["หายเกิน 90 วัน", data.silentCounts[90]],
    ["หายเกิน 180 วัน", data.silentCounts[180]],
    ["หายเกิน 365 วัน", data.silentCounts[365]],
    ["ยังไม่เคยมา", data.neverSold],
  ]);
  addSheet(
    wb,
    "รายชื่อ",
    ["ชื่อ", "กลุ่ม", "เบอร์โทร", "รหัส", "มาล่าสุด", "หายไปกี่วัน", "ยังไม่เคยมา", "ใบปีนี้", "น้ำหนักปีนี้", "ยอดปีนี้"],
    data.rows.map((row) => [
      row.name,
      row.group,
      row.tel,
      row.code,
      excelDay(row.lastPaidAt),
      row.neverSold ? "" : row.silentDays,
      row.neverSold ? "ใช่" : "",
      row.tickets,
      row.weightKg,
      row.amount,
    ])
  );
  return xlsxResponse(
    wb,
    exportFileName(["ลูกค้า", data.beYear, extras?.silentDays ? `หายเกิน${extras.silentDays}` : null, extras?.query])
  );
}

export async function exportCustomerMonths(data: CustomerPurchasesResult, title: string) {
  const wb = createWorkbook();
  const months = monthHeaders();
  addSheet(wb, "สรุป", ["รายการ", "ค่า"], [
    ["จำนวนรายชื่อ", data.total],
    ["ใบจ่ายแล้ว", data.tickets],
    ["น้ำหนักกก.", data.weightKg],
    ["ยอดบาท", data.amount],
    ["ปี พ.ศ.", data.beYear],
  ]);
  addSheet(
    wb,
    "บาท",
    ["ชื่อ", "กลุ่ม", "รหัส", "เบอร์", ...months, "รวม"],
    data.rows.map((row) => [row.name, row.group, row.code, row.tel, ...row.amountMonths, row.amountTotal])
  );
  addSheet(
    wb,
    "กก.",
    ["ชื่อ", "กลุ่ม", "รหัส", "เบอร์", ...months, "รวม"],
    data.rows.map((row) => [row.name, row.group, row.code, row.tel, ...row.weightKgMonths, row.weightKgTotal])
  );
  return xlsxResponse(wb, exportFileName([title, data.beYear]));
}

export async function exportTradeSummary(data: TradeSummary, lines?: TradeLinesResult | null) {
  const wb = createWorkbook();
  const sideLabel = data.side === "in" ? "ซื้อเข้า" : data.side === "out" ? "ขายออก" : "ส่วนต่างขาย-ซื้อ";
  const kpiRows: ExcelCell[][] =
    data.side === "profit"
      ? [
          ["ส่วนต่างขาย−ซื้อ (บาท)", data.kpis.amount],
          ["ส่วนต่างน้ำหนัก (กก.)", data.kpis.weightKg],
          ["ยอดขาย (บาท)", data.kpis.salesAmount ?? ""],
          ["ยอดซื้อ (บาท)", data.kpis.purchaseAmount ?? ""],
          ["น้ำหนักขาย (กก.)", data.kpis.salesWeightKg ?? ""],
          ["น้ำหนักซื้อ (กก.)", data.kpis.purchaseWeightKg ?? ""],
          ["ใบขาย", data.kpis.salesTickets ?? ""],
          ["ใบซื้อ", data.kpis.purchaseTickets ?? ""],
          ["ส่วนต่างต่อกก. ขาย", data.kpis.avgPerKg],
        ]
      : [
          ["ยอด (บาท)", data.kpis.amount],
          ["น้ำหนัก (กก.)", data.kpis.weightKg],
          ["จำนวนใบ", data.kpis.tickets],
          ["เฉลี่ยต่อกก.", data.kpis.avgPerKg],
        ];
  addSheet(wb, "KPI", ["รายการ", "ค่า"], kpiRows);
  addSheet(
    wb,
    "รายเดือน",
    ["เดือน", "ยอดบาท", "น้ำหนักกก.", "จำนวนใบ"],
    data.monthly.map((row) => [THAI_MONTHS_SHORT[row.month - 1] ?? row.month, row.amount, row.weightKg, row.tickets])
  );
  addSheet(
    wb,
    "รายวัน",
    ["วัน", "ยอดบาท", "น้ำหนักกก."],
    data.daily.map((row) => [row.day, row.amount, row.weightKg])
  );
  const months = monthHeaders();
  addSheet(
    wb,
    "พิโวทบาท",
    ["สาขา", "กลุ่มสินค้า", ...months, "รวม"],
    data.pivot.map((row) => [row.branchCode ?? "ไม่ระบุ", row.itemGroup ?? "ไม่ระบุ", ...row.amountMonths, row.amountTotal])
  );
  addSheet(
    wb,
    "พิโวทกก.",
    ["สาขา", "กลุ่มสินค้า", ...months, "รวม"],
    data.pivot.map((row) => [row.branchCode ?? "ไม่ระบุ", row.itemGroup ?? "ไม่ระบุ", ...row.weightKgMonths, row.weightKgTotal])
  );
  if (lines && (data.side === "in" || data.side === "out")) {
    addSheet(
      wb,
      "รายการบรรทัด",
      ["เลขที่", "เลขรัน", "วันที่จ่าย", "รหัส", "สินค้า", "สาขา", "กลุ่ม", "รวม", "หัก", "เจือปน", "สุทธิ", "กก.", "ราคาจ่าย", "ยอด"],
      lines.rows.map((row) => [
        row.ticketNumber,
        row.runningNumber,
        excelDay(row.paidAt),
        row.code,
        row.name,
        row.branchCode,
        row.itemGroup,
        row.weightGross,
        row.deduct,
        row.waste,
        row.weight,
        row.weightKg,
        row.paidPrice,
        row.amount,
      ])
    );
  }
  return xlsxResponse(wb, exportFileName([sideLabel, data.beYear]));
}

export async function exportSmallIn(data: SmallInResult) {
  const wb = createWorkbook();
  addSheet(wb, "สรุป", ["รายการ", "ค่า"], [
    ["ปี พ.ศ.", data.beYear],
    ["เพดานบาท", data.cap],
    ["จำนวนใบ", data.tickets],
    ["ยอดบาท", data.amount],
  ]);
  addSheet(
    wb,
    "รายเดือน",
    ["เดือน", "ยอดบาท", "จำนวนใบ"],
    data.monthly.map((row) => [THAI_MONTHS_SHORT[row.month - 1] ?? row.month, row.amount, row.tickets])
  );
  addSheet(
    wb,
    "รายวัน",
    ["วัน", "ยอดบาท", "จำนวนใบ"],
    data.daily.map((row) => [row.day, row.amount, row.tickets])
  );
  addSheet(
    wb,
    "สาขา",
    ["สาขา", "ยอดบาท", "จำนวนใบ", "สัดส่วน"],
    data.branches.map((row) => [row.branchCode ?? "ไม่ระบุ", row.amount, row.tickets, row.share])
  );
  addSheet(
    wb,
    "กลุ่มสินค้า",
    ["กลุ่มสินค้า", "ยอดบาท", "จำนวนใบ", "สัดส่วน"],
    data.itemGroups.map((row) => [row.itemGroup ?? "ไม่ระบุ", row.amount, row.tickets, row.share])
  );
  addSheet(
    wb,
    "รายวันตามกลุ่ม",
    ["วัน", "กลุ่มสินค้า", "ยอดบาท"],
    data.itemGroupDaily.map((row) => [row.day, row.itemGroup ?? "ไม่ระบุ", row.amount])
  );
  return xlsxResponse(wb, exportFileName(["ยอดซื้อต่ำกว่าเกณฑ์", data.beYear, `ไม่ถึง${data.cap}`]));
}

export async function exportCustomerReport(data: CustomerReportResult) {
  const wb = createWorkbook();
  addSheet(wb, "KPI", ["รายการ", "เดือนนี้", "เดือนก่อน", "เปลี่ยนเปอร์เซ็นต์"], [
    ["ลูกค้าใหม่", data.newCustomers.current, data.newCustomers.previous, data.newCustomers.changePct],
    ["ลูกค้าที่หาย", data.lostCustomers.current, data.lostCustomers.previous, data.lostCustomers.changePct],
    ["ลูกค้าเดิมที่ยังอยู่", data.retainedCustomers.current, data.retainedCustomers.previous, data.retainedCustomers.changePct],
    ["ลูกค้ากลับมา", data.returnedCustomers.current, data.returnedCustomers.previous, data.returnedCustomers.changePct],
  ]);
  addSheet(
    wb,
    "รายเดือน",
    ["เดือน", "ใหม่", "กลับมา"],
    data.series.map((row) => [row.month, row.newCount, row.returningCount])
  );
  const headers = ["ชื่อ", "กลุ่ม", "เบอร์โทร", "รหัส", "มาล่าสุด", "จำนวนใบ", "ยอด"];
  for (const item of REPORT_LISTS) {
    addSheet(wb, item.label, headers, personRows(data.lists[item.kind] ?? []));
  }
  return xlsxResponse(wb, exportFileName(["ลูกค้าReport", data.beYear]));
}

export async function exportStock(data: StockResult) {
  const wb = createWorkbook();
  addSheet(wb, "สรุป", ["รายการ", "ค่า"], [
    ["รายการที่มีสต็อก", data.productCount],
    ["ปริมาณคลัง", data.stockQty],
    ["น้ำหนักกก.", data.weightKg],
    ["มูลค่าประมาณ", data.estimatedValue],
    ["จาก", data.from],
    ["ถึง", data.to],
  ]);
  addSheet(
    wb,
    "รายสินค้า",
    ["สาขา", "หมวด", "รหัส", "สินค้า", "คงเหลือ", "กก.", "หน่วย", "ราคาตั้งต้น", "ราคาถัวเฉลี่ย", "มูลค่าประมาณ"],
    data.rows.map((row) => [
      row.branchCode ?? "ไม่ระบุ",
      row.itemGroup ?? "ไม่ระบุ",
      row.code,
      row.name,
      row.stockQty,
      row.weightKg,
      formatUnit(row.unit),
      row.basePrice,
      avgPaid(row.buyAmount, row.buyWeight),
      row.estimatedValue,
    ])
  );
  return xlsxResponse(wb, exportFileName(["สต็อก", data.from, data.to]));
}

export async function exportOpenTickets(data: OpenTicketsResult) {
  const wb = createWorkbook();
  addSheet(wb, "สรุป", ["รายการ", "ค่า"], [
    ["ซื้อค้าง", data.openIn],
    ["ขายค้าง", data.openOut],
    ["เกิน 24 ชม.", data.over24],
    ["รายการในไฟล์", data.rows.length],
  ]);
  addSheet(
    wb,
    "ตั๋วเปิด",
    ["ประเภท", "เลขที่", "สถานะ", "คู่ค้า", "ผู้บันทึก", "สาขา", "หมวด", "ยอด", "น้ำหนักคลัง", "สร้าง", "อายุชม."],
    data.rows.map((row) => [
      row.side === "in" ? "ซื้อ" : "ขาย",
      row.runningNumber ?? row.number,
      row.status,
      row.counterparty,
      row.recordedByName,
      row.branches.join(", "),
      row.itemGroups.join(", "),
      row.net,
      row.weight,
      excelDay(row.createdAt),
      row.ageHours,
    ])
  );
  return xlsxResponse(wb, exportFileName(["ยังไม่ปิด"]));
}

export async function exportLookup(data: TicketLookupResult) {
  const wb = createWorkbook();
  addSheet(
    wb,
    "ตั๋ว",
    ["ประเภท", "เลขที่", "เลขรัน", "สถานะ", "ถูกลบ", "คู่ค้า", "ผู้บันทึก", "ยอด", "น้ำหนัก", "วันที่จ่าย"],
    data.tickets.map((ticket) => [
      ticket.side === "in" ? "ซื้อ" : "ขาย",
      ticket.number,
      ticket.runningNumber,
      ticket.status,
      ticket.isDeleted ? "ใช่" : "",
      ticket.counterparty,
      ticket.recordedByName,
      ticket.net,
      ticket.weight,
      excelDay(ticket.paidAt),
    ])
  );
  addSheet(
    wb,
    "รายการสินค้า",
    ["ประเภท", "เลขที่ตั๋ว", "รหัส", "สินค้า", "สาขา", "กลุ่ม", "น้ำหนัก", "ราคาจ่าย"],
    data.tickets.flatMap((ticket) =>
      ticket.items.map((item) => [
        ticket.side === "in" ? "ซื้อ" : "ขาย",
        ticket.runningNumber ?? ticket.number,
        item.code,
        item.name,
        item.branchCode,
        item.itemGroup,
        item.weight,
        item.paidPrice,
      ])
    )
  );
  return xlsxResponse(wb, exportFileName(["ตรวจตั๋ว", data.query]));
}

export async function exportSalesProfit(data: SalesProfitResult) {
  const wb = createWorkbook();
  addSheet(wb, "สรุป", ["รายการ", "ค่า"], [
    ["ยอดขาย", data.net],
    ["ต้นทุนขาย", data.cost],
    ["กำไรจากการขาย", data.profit],
    ["จำนวนใบ", data.tickets],
    ["น้ำหนักคลัง", data.weight],
    ["หมายเหตุ", data.note],
  ]);
  addSheet(
    wb,
    "รายเดือน",
    ["เดือน", "ยอดขาย", "ต้นทุนขาย", "กำไรจากการขาย", "จำนวนใบ", "น้ำหนักคลัง"],
    data.monthly.map((row) => [
      THAI_MONTHS_SHORT[row.month - 1] ?? row.month,
      row.net,
      row.cost,
      row.profit,
      row.tickets,
      row.weight,
    ])
  );
  addSheet(
    wb,
    "รายใบ",
    ["เลขที่", "วันที่จ่าย", "ผู้ซื้อ", "ยอด", "ต้นทุน", "กำไรจากการขาย", "น้ำหนักคลัง"],
    data.rows.map((row) => [row.number, excelDay(row.paidAt), row.buyerName, row.net, row.cost, row.profit, row.weight])
  );
  return xlsxResponse(wb, exportFileName(["กำไรจากการขาย", data.beYear]));
}

export async function exportTransforms(data: StockTransformsResult) {
  const wb = createWorkbook();
  addSheet(wb, "สรุป", ["รายการ", "ค่า"], [
    ["ปี พ.ศ.", data.beYear],
    ["เดือน", data.month],
    ["ครั้งแปรสภาพ", data.transforms],
    ["น้ำหนักเข้ากก.", data.inputKg],
    ["น้ำหนักออกกก.", data.outputKg],
    ["ส่วนต่างน้ำหนักออก-เข้า", data.deltaKg],
  ]);
  addSheet(
    wb,
    "หัวรายการ",
    ["วันที่", "ผู้บันทึก", "บรรทัดเข้า", "บรรทัดออก", "กก.เข้า", "กก.ออก"],
    data.rows.map((row) => [
      excelDay(row.createdAt),
      row.recordedByName,
      row.inputLines,
      row.outputLines,
      row.inputKg,
      row.outputKg,
    ])
  );
  addSheet(
    wb,
    "บรรทัดเข้าออก",
    ["วันที่", "ทิศทาง", "รหัส", "สินค้า", "สาขา", "กลุ่ม", "น้ำหนัก", "กก."],
    data.rows.flatMap((row) =>
      row.items.map((item) => [
        excelDay(row.createdAt),
        item.direction === "input" ? "เข้า" : "ออก",
        item.code,
        item.name,
        item.branchCode,
        item.itemGroup,
        item.weight,
        item.weightKg,
      ])
    )
  );
  return xlsxResponse(wb, exportFileName(["แปรสภาพ", data.beYear, String(data.month).padStart(2, "0")]));
}
