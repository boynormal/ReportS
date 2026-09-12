export type CustomerReportKpi = {
  current: number;
  previous: number;
  changePct: number | null;
};

export type CustomerReportMonthPoint = {
  month: string;
  newCount: number;
  returningCount: number;
};

export type CustomerReportKind = "new" | "lost" | "retained" | "returned";

export type CustomerReportPerson = {
  sellerId: string;
  name: string | null;
  code: string | null;
  tel: string | null;
  group: string;
  lastPaidAt: string | null;
  tickets: number;
  amount: number;
};

export type CustomerReportResult = {
  ceYear: number;
  beYear: number;
  availableBeYears: number[];
  monthStart: string;
  previousMonthStart: string;
  newCustomers: CustomerReportKpi;
  lostCustomers: CustomerReportKpi;
  retainedCustomers: CustomerReportKpi;
  returnedCustomers: CustomerReportKpi;
  amount: CustomerReportKpi;
  series: CustomerReportMonthPoint[];
  groups: string[];
  lists: Record<CustomerReportKind, CustomerReportPerson[]>;
};
