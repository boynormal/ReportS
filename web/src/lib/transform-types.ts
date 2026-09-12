export type TransformItem = {
  direction: "input" | "output";
  code: string | null;
  name: string | null;
  branchCode: string | null;
  itemGroup: string | null;
  weight: number;
  weightKg: number;
};

export type TransformRow = {
  id: string;
  createdAt: string | null;
  recordedByName: string | null;
  inputLines: number;
  outputLines: number;
  inputKg: number;
  outputKg: number;
  items: TransformItem[];
};

export type TransformMonth = {
  month: number;
  transforms: number;
  inputKg: number;
  outputKg: number;
};

export type StockTransformsResult = {
  note: string;
  ceYear: number;
  beYear: number;
  month: number;
  transforms: number;
  inputKg: number;
  outputKg: number;
  deltaKg: number;
  total: number;
  availableBeYears: number[];
  branches: string[];
  itemGroups: string[];
  monthly: TransformMonth[];
  rows: TransformRow[];
};
