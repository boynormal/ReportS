export type SalesProfitTicket = {
  id: string;
  number: number | null;
  paidAt: string | null;
  buyerId: string | null;
  buyerName: string | null;
  net: number;
  cost: number;
  profit: number;
  weight: number;
};

export type SalesProfitMonth = {
  month: number;
  net: number;
  cost: number;
  profit: number;
  tickets: number;
  weight: number;
};

export type SalesProfitDay = {
  day: string;
  net: number;
  cost: number;
  profit: number;
  tickets: number;
};

export type SalesProfitResult = {
  note: string;
  ceYear: number;
  beYear: number;
  tickets: number;
  net: number;
  cost: number;
  profit: number;
  weight: number;
  page: number;
  pageSize: number;
  total: number;
  availableBeYears: number[];
  branches: string[];
  itemGroups: string[];
  monthly: SalesProfitMonth[];
  daily: SalesProfitDay[];
  rows: SalesProfitTicket[];
};
