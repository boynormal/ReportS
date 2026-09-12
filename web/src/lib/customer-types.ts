export type SellerChoice = {
  sellerId: string;
  name: string | null;
  code: string | null;
  tel: string | null;
};

export type CustomerRow = {
  sellerId: string;
  code: string | null;
  name: string | null;
  tel: string | null;
  group: string;
  lastPaidAt: string | null;
  silentDays: number | null;
  neverSold: boolean;
  tickets: number;
  weightKg: number;
  amount: number;
};

export const CUSTOMER_SILENT_BUCKETS = [30, 60, 90, 180, 365] as const;
export type CustomerSilentBucket = (typeof CUSTOMER_SILENT_BUCKETS)[number];

export type CustomersResult = {
  note: string;
  ceYear: number;
  beYear: number;
  customerCount: number;
  silent90: number;
  neverSold: number;
  silentCounts: Record<CustomerSilentBucket, number>;
  weightKg: number;
  amount: number;
  page: number;
  pageSize: number;
  total: number;
  groups: string[];
  availableBeYears: number[];
  rows: CustomerRow[];
};
