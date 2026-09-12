export type CustomerPurchaseRow = {
  sellerId: string;
  name: string | null;
  code: string | null;
  tel: string | null;
  group: string;
  amountMonths: number[];
  weightKgMonths: number[];
  ticketsMonths: number[];
  amountTotal: number;
  weightKgTotal: number;
  ticketsTotal: number;
};

export type CustomerPurchasesResult = {
  note: string;
  ceYear: number;
  beYear: number;
  customerCount: number;
  tickets: number;
  weightKg: number;
  amount: number;
  page: number;
  pageSize: number;
  total: number;
  availableBeYears: number[];
  rows: CustomerPurchaseRow[];
};
