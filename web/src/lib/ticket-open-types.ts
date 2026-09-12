export type OpenTicketRow = {
  side: "in" | "out";
  id: string;
  runningNumber: string | null;
  number: number | null;
  status: string | null;
  recordedByName: string | null;
  counterparty: string | null;
  net: number;
  weight: number;
  createdAt: string | null;
  ageHours: number;
  branches: string[];
  itemGroups: string[];
};

export type OpenTicketsResult = {
  note: string;
  openIn: number;
  openOut: number;
  over24: number;
  branches: string[];
  itemGroups: string[];
  rows: OpenTicketRow[];
};
