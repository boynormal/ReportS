export const ITEM_GROUP_NAMES: Record<string, string> = {
  BA: "แบตเตอรี่",
  BA_MO: "แบตเตอรี่มอเตอร์ไซค์",
  BA_UPS: "แบตเตอรี่ UPS",
  Al: "อลูมิเนียม",
  CU: "ทองแดง",
  BR: "ทองเหลือง",
  Pb: "ตะกั่ว",
  SUS: "สแตนเลส",
  Zn: "ซีโฮ้ว",
  Fe: "เหล็ก",
  Pa: "กระดาษ",
  Gl: "เศษแก้ว",
  Bo: "ขวดแก้ว",
  Pet: "ขวด PET",
  Pl: "พลาสติก",
  EL: "อิเล็กทรอนิกส์",
  EM: "เครื่องใช้ไฟฟ้า",
  FI: "ฟิล์ม",
};

export type YearCompareMetric = "tickets" | "customers" | "weightKg" | "amount";

export type YearCompareTotals = {
  tickets: number;
  customers: number;
  weightKg: number;
  amount: number;
  ticketsPerCustomer: number;
};

export type YearCompareChange = {
  tickets: number | null;
  customers: number | null;
  weightKg: number | null;
  amount: number | null;
  ticketsPerCustomer: number | null;
};

export type YearCompareMonth = {
  month: number;
  tickets: number | null;
  customers: number | null;
  weightKg: number | null;
  amount: number | null;
};

export type YearCompareCategory = {
  itemGroup: string | null;
  nameTh: string;
  current: YearCompareTotals;
  previous: YearCompareTotals;
  changePct: YearCompareChange;
  currentMonths: YearCompareMonth[];
  previousMonths: YearCompareMonth[];
};

export type YearCompareFilters = {
  branch?: string | null;
  itemGroups?: string[];
};

export type YearCompareResult = {
  side: "in";
  note: string;
  ceYear: number;
  beYear: number;
  compareCeYear: number;
  compareBeYear: number;
  throughMonth: number;
  includeCurrentMonth: boolean;
  branch: string | null;
  itemGroupsFilter: string[];
  lastPaidAt: string | null;
  previousMissing: boolean;
  completeness: {
    currentMonths: number[];
    previousMonths: number[];
    currentLabel: string;
    previousLabel: string;
  };
  kpis: {
    current: YearCompareTotals;
    previous: YearCompareTotals;
    changePct: YearCompareChange;
  };
  monthly: {
    current: YearCompareMonth[];
    previous: YearCompareMonth[];
  };
  categories: YearCompareCategory[];
  availableBeYears: number[];
  branches: string[];
  itemGroups: string[];
};

export function itemGroupName(code: string | null | undefined): string {
  if (!code) return "ไม่ระบุ";
  return ITEM_GROUP_NAMES[code] ?? code;
}

export function pctChange(current: number, previous: number): number | null {
  if (previous === 0) return current === 0 ? 0 : null;
  return ((current - previous) / previous) * 100;
}

export function emptyTotals(): YearCompareTotals {
  return { tickets: 0, customers: 0, weightKg: 0, amount: 0, ticketsPerCustomer: 0 };
}

export function withTicketsPerCustomer(row: Omit<YearCompareTotals, "ticketsPerCustomer">): YearCompareTotals {
  return {
    ...row,
    ticketsPerCustomer: row.customers > 0 ? row.tickets / row.customers : 0,
  };
}

export function changeOf(current: YearCompareTotals, previous: YearCompareTotals): YearCompareChange {
  return {
    tickets: pctChange(current.tickets, previous.tickets),
    customers: pctChange(current.customers, previous.customers),
    weightKg: pctChange(current.weightKg, previous.weightKg),
    amount: pctChange(current.amount, previous.amount),
    ticketsPerCustomer: pctChange(current.ticketsPerCustomer, previous.ticketsPerCustomer),
  };
}
