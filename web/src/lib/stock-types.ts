export type StockProduct = {
  id: string;
  code: string | null;
  name: string | null;
  branchCode: string | null;
  itemGroup: string | null;
  unit: string | null;
  stockQty: number;
  weightKg: number;
  basePrice: number;
  estimatedValue: number;
  avgPaidPrice: number | null;
  buyAmount: number;
  buyWeight: number;
};

export type StockResult = {
  note: string;
  from: string;
  to: string;
  productCount: number;
  stockQty: number;
  weightKg: number;
  estimatedValue: number;
  branches: string[];
  itemGroups: string[];
  rows: StockProduct[];
};
