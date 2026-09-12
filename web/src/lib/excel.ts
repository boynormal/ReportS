import ExcelJS from "exceljs";

export type ExcelCell = string | number | boolean | Date | null | undefined;

export function createWorkbook(): ExcelJS.Workbook {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Scrapee Dashboard";
  wb.created = new Date();
  return wb;
}

function sheetName(name: string): string {
  return name.replace(/[\[\]*\/\\?:]/g, "-").slice(0, 31) || "Sheet1";
}

export function addSheet(wb: ExcelJS.Workbook, name: string, headers: string[], rows: ExcelCell[][]): ExcelJS.Worksheet {
  const sheet = wb.addWorksheet(sheetName(name));
  sheet.addRow(headers);
  const head = sheet.getRow(1);
  head.font = { bold: true };
  head.alignment = { vertical: "middle" };
  for (const row of rows) sheet.addRow(row.map((value) => (value == null ? "" : value)));
  headers.forEach((header, i) => {
    let width = header.length + 2;
    for (const row of rows.slice(0, 80)) {
      const raw = row[i];
      width = Math.max(width, String(raw ?? "").length + 2);
    }
    sheet.getColumn(i + 1).width = Math.min(42, Math.max(10, width));
  });
  return sheet;
}

export function exportFileName(parts: Array<string | number | null | undefined>): string {
  const stem = parts
    .map((part) => (part == null || part === "" ? "" : String(part)))
    .filter(Boolean)
    .join("_")
    .replace(/[\\/:*?"<>|]+/g, "-");
  return `${stem || "export"}.xlsx`;
}

export function excelDay(value: string | Date | null | undefined): string {
  if (!value) return "";
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return value.length >= 10 ? value.slice(0, 10) : value;
}

export async function xlsxResponse(wb: ExcelJS.Workbook, filename: string): Promise<Response> {
  const buffer = await wb.xlsx.writeBuffer();
  const encoded = encodeURIComponent(filename);
  const ascii = filename.replace(/[^\x20-\x7E]/g, "_");
  return new Response(Buffer.from(buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${ascii}"; filename*=UTF-8''${encoded}`,
    },
  });
}
