export type LookupTicketItem = {
  code: string | null;
  name: string | null;
  branchCode: string | null;
  itemGroup: string | null;
  weight: number;
  paidPrice: number;
};

export type LookupTicket = {
  side: "in" | "out";
  id: string;
  runningNumber: string | null;
  number: number | null;
  status: string | null;
  isDeleted: boolean;
  counterparty: string | null;
  recordedByName: string | null;
  net: number;
  weight: number;
  paidAt: string | null;
  items: LookupTicketItem[];
};

export type TicketLookupResult = {
  query: string;
  matches: number;
  duplicateWarning: string | null;
  tickets: LookupTicket[];
};
