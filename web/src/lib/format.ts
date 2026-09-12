export function formatMoney(value: number): string {
  return new Intl.NumberFormat("th-TH", {
    maximumFractionDigits: 0,
  }).format(Math.round(value));
}

export function formatNumber(value: number, digits = 0): string {
  return new Intl.NumberFormat("th-TH", {
    maximumFractionDigits: digits,
    minimumFractionDigits: digits,
  }).format(value);
}

export function formatDecimal(value: number, digits = 2): string {
  return new Intl.NumberFormat("th-TH", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(value);
}

export function formatHours(value: number): string {
  if (value < 24) return `${formatNumber(value, 1)} ชม.`;
  return `${formatNumber(value / 24, 1)} วัน`;
}

export function formatWhen(value: string | Date | null | undefined): string {
  if (!value) return "—";
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat("th-TH", {
    timeZone: "Asia/Bangkok",
    dateStyle: "medium",
    timeStyle: "short",
  }).format(d);
}
