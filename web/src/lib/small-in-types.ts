export const SMALL_IN_CAPS = [10000, 20000, 30000, 50000] as const;
export type SmallInCap = (typeof SMALL_IN_CAPS)[number];

export type SmallInMonth = {
  month: number;
  amount: number;
  tickets: number;
};

export type SmallInDay = {
  day: string;
  amount: number;
  tickets: number;
};

export type SmallInBranch = {
  branchCode: string | null;
  amount: number;
  tickets: number;
  share: number;
};

export type SmallInItemGroup = {
  itemGroup: string | null;
  amount: number;
  tickets: number;
  share: number;
};

export type SmallInItemGroupDay = {
  day: string;
  itemGroup: string | null;
  amount: number;
};

export const SMALL_IN_NONE = "__none__";

export type SmallInFilters = {
  branches?: string[];
  itemGroups?: string[];
};

export type SmallInResult = {
  ceYear: number;
  beYear: number;
  cap: SmallInCap;
  tickets: number;
  amount: number;
  availableBeYears: number[];
  monthly: SmallInMonth[];
  daily: SmallInDay[];
  branches: SmallInBranch[];
  itemGroups: SmallInItemGroup[];
  itemGroupDaily: SmallInItemGroupDay[];
  filterBranches: string[];
  filterItemGroups: string[];
};
