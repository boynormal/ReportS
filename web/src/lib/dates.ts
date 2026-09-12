export type DatePreset =
  | "today"
  | "yesterday"
  | "7d"
  | "this-month"
  | "last-month"
  | "this-year"
  | "custom";

export type DateRange = {
  from: Date;
  to: Date;
};

const BANGKOK = "Asia/Bangkok";

function bangkokYmd(date: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: BANGKOK,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function bangkokParts(date: Date): { y: number; m: number; d: number } {
  const [y, m, d] = bangkokYmd(date).split("-").map(Number);
  return { y: y!, m: m!, d: d! };
}

/** Start of Bangkok calendar day as UTC instant. */
export function bangkokDayStart(year: number, month: number, day: number): Date {
  return new Date(Date.UTC(year, month - 1, day, -7, 0, 0, 0));
}

export function parseIsoDate(value: string | null | undefined): Date | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [y, m, d] = value.split("-").map(Number);
  return bangkokDayStart(y!, m!, d!);
}

export function rangeFromPreset(preset: DatePreset, customFrom?: string, customTo?: string): DateRange {
  const now = new Date();
  const { y, m, d } = bangkokParts(now);

  if (preset === "custom") {
    const from = parseIsoDate(customFrom) ?? bangkokDayStart(y, m, 1);
    const toExclusive = parseIsoDate(customTo);
    const to = toExclusive
      ? new Date(toExclusive.getTime() + 24 * 60 * 60 * 1000)
      : bangkokDayStart(y, m, d + 1);
    return { from, to };
  }
  if (preset === "today") {
    const from = bangkokDayStart(y, m, d);
    return { from, to: bangkokDayStart(y, m, d + 1) };
  }
  if (preset === "yesterday") {
    const from = bangkokDayStart(y, m, d - 1);
    return { from, to: bangkokDayStart(y, m, d) };
  }
  if (preset === "7d") {
    return { from: bangkokDayStart(y, m, d - 6), to: bangkokDayStart(y, m, d + 1) };
  }
  if (preset === "this-month") {
    return { from: bangkokDayStart(y, m, 1), to: bangkokDayStart(y, m + 1, 1) };
  }
  if (preset === "last-month") {
    return { from: bangkokDayStart(y, m - 1, 1), to: bangkokDayStart(y, m, 1) };
  }
  return { from: bangkokDayStart(y, 1, 1), to: bangkokDayStart(y + 1, 1, 1) };
}

/** Bangkok calendar date YYYY-MM-DD for comparing view `day` columns. */
export function sqlDay(date: Date): string {
  return bangkokYmd(date);
}

export function parseRange(search: URLSearchParams): DateRange {
  const preset = (search.get("preset") as DatePreset | null) ?? "this-year";
  return rangeFromPreset(preset, search.get("from") ?? undefined, search.get("to") ?? undefined);
}

export const PRESET_LABELS: Record<DatePreset, string> = {
  today: "วันนี้",
  yesterday: "เมื่อวาน",
  "7d": "7 วัน",
  "this-month": "เดือนนี้",
  "last-month": "เดือนก่อน",
  "this-year": "ปีนี้",
  custom: "กำหนดเอง",
};

export const THAI_MONTHS_SHORT = [
  "ม.ค.",
  "ก.พ.",
  "มี.ค.",
  "เม.ย.",
  "พ.ค.",
  "มิ.ย.",
  "ก.ค.",
  "ส.ค.",
  "ก.ย.",
  "ต.ค.",
  "พ.ย.",
  "ธ.ค.",
] as const;

export function toBuddhistYear(ceYear: number): number {
  return ceYear + 543;
}

export function fromBuddhistYear(beYear: number): number {
  return beYear - 543;
}

export function currentBuddhistYear(): number {
  return toBuddhistYear(bangkokParts(new Date()).y);
}

export function currentCeYear(): number {
  return bangkokParts(new Date()).y;
}

export function currentCeMonth(): number {
  return bangkokParts(new Date()).m;
}

/** Bangkok calendar year [from, to) for a Buddhist era year (e.g. 2569 → 2026). */
export function buddhistYearRange(beYear: number): DateRange {
  const ce = fromBuddhistYear(beYear);
  return { from: bangkokDayStart(ce, 1, 1), to: bangkokDayStart(ce + 1, 1, 1) };
}

export function ceYearRange(ceYear: number): DateRange {
  return { from: bangkokDayStart(ceYear, 1, 1), to: bangkokDayStart(ceYear + 1, 1, 1) };
}

export function ceMonthRange(ceYear: number, month: number): DateRange {
  return { from: bangkokDayStart(ceYear, month, 1), to: bangkokDayStart(ceYear, month + 1, 1) };
}
