export type TradeSide = "in" | "out" | "profit";

export type TradeMonthPoint = {
  month: number;
  amount: number;
  weightKg: number;
  tickets: number;
  costAmount?: number;
  salesProfit?: number;
};

export type TradeDayPoint = {
  day: string;
  amount: number;
  weightKg: number;
};

export type TradePivotRow = {
  branchCode: string | null;
  itemGroup: string | null;
  amountMonths: number[];
  weightKgMonths: number[];
  amountTotal: number;
  weightKgTotal: number;
};

export type TradeFilters = {
  branch?: string | null;
  itemGroup?: string | null;
  sellerId?: string | null;
  buyerId?: string | null;
};

export type TradeLine = {
  ticketId: string;
  ticketNumber: number | null;
  runningNumber: string | null;
  paidAt: string | null;
  code: string | null;
  name: string | null;
  branchCode: string | null;
  itemGroup: string | null;
  weightGross: number;
  deduct: number;
  waste: number;
  weight: number;
  weightKg: number;
  paidPrice: number;
  amount: number;
};

export type TradeLinesResult = {
  side: "in" | "out";
  ceYear: number;
  beYear: number;
  month: number | null;
  branch: string | null;
  itemGroup: string | null;
  sellerId: string | null;
  sellerName: string | null;
  buyerId: string | null;
  buyerName: string | null;
  page: number;
  pageSize: number;
  totalLines: number;
  totalTickets: number;
  amount: number;
  weightKg: number;
  rows: TradeLine[];
};

export type TradeSummary = {
  side: TradeSide;
  ceYear: number;
  beYear: number;
  grain: "item" | "ticket";
  note: string;
  kpis: {
    amount: number;
    weightKg: number;
    tickets: number;
    costAmount: number | null;
    salesProfit: number | null;
    avgPerKg: number;
    salesAmount?: number;
    purchaseAmount?: number;
    salesTickets?: number;
    purchaseTickets?: number;
    salesWeightKg?: number;
    purchaseWeightKg?: number;
  };
  monthly: TradeMonthPoint[];
  daily: TradeDayPoint[];
  pivot: TradePivotRow[];
  availableBeYears: number[];
  branches: string[];
  itemGroups: string[];
};
