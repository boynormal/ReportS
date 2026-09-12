export type FirestoreLikeTimestamp = {
  toDate?: () => Date;
  seconds?: number;
  nanoseconds?: number;
};

export interface TicketItemRow {
  ticketId: string;
  clientId: string;
  productId: string | null;
  code: string | null;
  name: string | null;
  branchCode: string | null;
  itemGroup: string | null;
  category: string | null;
  subcategory: string | null;
  translatedCategory: string | null;
  weight: number | null;
  deduct: number | null;
  unit: string | null;
  basePrice: number | null;
  paidPrice: number | null;
  priceReason: string | null;
  priceReasonId: string | null;
  priceLocked: boolean | null;
  tierPricing: unknown;
  wastes: unknown;
  recordedBy: string | null;
  localTimestamp: Date | null;
}

export interface TicketRow {
  id: string;
  companyId: string;
  runningNumber: string | null;
  number: number | null;
  status: string | null;
  done: boolean | null;
  payment: string | null;
  paidBy: string | null;
  recordedBy: string | null;
  beforeTax: number | null;
  tax: number | null;
  taxCalculation: string | null;
  net: number | null;
  finalRounding: string | null;
  pureWeight: number | null; // may be fractional in source data
  note: string | null;
  truck: string | null;
  productIds: string[] | null;
  sellerId: string | null;
  sellerCode: string | null;
  sellerFullname: string | null;
  sellerSnapshot: unknown;
  createdAt: Date | null;
  updatedAt: Date | null;
  paidTimestamp: Date | null;
  paidAt: Date | null;
  firestoreUpdateTime: Date | null;
  items: TicketItemRow[];
}

export interface SellerRow {
  id: string;
  companyId: string;
  code: string | null;
  fullname: string | null;
  tel: string | null;
  address: string | null;
  type: string | null;
  customerGroup: string | null;
  taxId: string | null;
  taxForBuying: string | null;
  licensePlate: string | null;
  vehicleType: string | null;
  vehicles: unknown;
  bankName: string | null;
  bankAccountName: string | null;
  bankAccountNumber: string | null;
  bankName2: string | null;
  bankAccountName2: string | null;
  bankAccountNumber2: string | null;
  additionalBankAccounts: unknown;
  createdAt: Date | null;
  raw: unknown;
}

export interface ProductRow {
  id: string;
  companyId: string;
  code: string | null;
  name: string | null;
  branchCode: string | null;
  itemGroup: string | null;
  category: string | null;
  subcategory: string | null;
  unit: string | null;
  basePrice: number | null;
  kgConversion: number | null;
  hidden: boolean | null;
  color: string | null;
  backgroundColor: string | null;
  tierPricing: unknown;
  stockQty: number | null;
  createdAt: Date | null;
  updatedAt: Date | null;
  raw: unknown;
}

export interface CustomerGroupRow {
  id: string;
  companyId: string;
  name: string | null;
  description: string | null;
  isDefault: boolean | null;
  recordedBy: string | null;
  sellers: unknown;
  productMap: unknown;
  updatedAt: Date | null;
  raw: unknown;
}

export interface OutTicketRow {
  id: string;
  companyId: string;
  number: number | null;
  title: string | null;
  status: string | null;
  recordedBy: string | null;
  beforeTax: number | null;
  tax: number | null;
  taxCalculation: string | null;
  net: number | null;
  finalRounding: string | null;
  cost: number | null;
  profit: number | null;
  profitLoss: number | null;
  pureWeight: number | null;
  acceptedWeight: number | null;
  weightLoss: number | null;
  productIds: string[] | null;
  buyerId: string | null;
  buyerFullname: string | null;
  buyerSnapshot: unknown;
  truck: unknown;
  createdAt: Date | null;
  updatedAt: Date | null;
  paidAt: Date | null;
  stockUpdatedAt: Date | null;
  firestoreUpdateTime: Date | null;
  items: TicketItemRow[];
}

export interface StockTransformItemRow {
  transformId: string;
  direction: "input" | "output";
  lineIndex: number;
  productId: string | null;
  code: string | null;
  name: string | null;
  branchCode: string | null;
  itemGroup: string | null;
  category: string | null;
  subcategory: string | null;
  weight: number | null;
  quantity: number | null;
  unit: string | null;
  raw: unknown;
}

export interface StockTransformRow {
  id: string;
  companyId: string;
  recordedBy: string | null;
  productIds: string[] | null;
  createdAt: Date | null;
  firestoreUpdateTime: Date | null;
  raw: unknown;
  items: StockTransformItemRow[];
}

export interface EmployeeRow {
  id: string;
  companyId: string;
  displayName: string | null;
  email: string | null;
  role: string | null;
  createdAt: Date | null;
  raw: unknown;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return null;
}

function asString(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  return String(value);
}

function asNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function asBoolean(value: unknown): boolean | null {
  if (value === null || value === undefined) return null;
  return Boolean(value);
}

function asStringArray(value: unknown): string[] | null {
  if (!Array.isArray(value)) return null;
  return value.map((v) => String(v));
}

/** Company SKU: {branch 1 digit}{item_group letters/_}{seq 3 digits} then name */
const COMPANY_PRODUCT_CODE_RE = /^([0-9])([A-Za-z][A-Za-z_]*)([0-9]{3})(?:\s+|$)/;

export function parseCompanyProductCode(
  code: string | null,
  name: string | null
): { branchCode: string | null; itemGroup: string | null } {
  const fromCode = code ? COMPANY_PRODUCT_CODE_RE.exec(code) : null;
  if (fromCode) {
    return { branchCode: fromCode[1] ?? null, itemGroup: fromCode[2] ?? null };
  }
  const firstToken = name?.trim().split(/\s+/, 1)[0] ?? "";
  const fromName = firstToken ? COMPANY_PRODUCT_CODE_RE.exec(firstToken) : null;
  if (fromName) {
    return { branchCode: fromName[1] ?? null, itemGroup: fromName[2] ?? null };
  }
  return { branchCode: null, itemGroup: null };
}

/** Convert Firestore Timestamp / plain object / Date to Date */
export function toDate(value: unknown): Date | null {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return value;
  const ts = value as FirestoreLikeTimestamp;
  if (typeof ts.toDate === "function") {
    return ts.toDate();
  }
  if (typeof ts.seconds === "number") {
    return new Date(ts.seconds * 1000 + Math.floor((ts.nanoseconds ?? 0) / 1e6));
  }
  if (typeof value === "string" || typeof value === "number") {
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  return null;
}

function transformWeighedItems(
  ticketId: string,
  data: Record<string, unknown>
): TicketItemRow[] {
  const map = asRecord(data.weighedProductMap) ?? {};
  return Object.entries(map).map(([key, rawItem]) => {
    const item = asRecord(rawItem) ?? {};
    const clientId = asString(item.clientId) ?? key;
    const code = asString(item.code);
    const name = asString(item.name);
    const { branchCode, itemGroup } = parseCompanyProductCode(code, name);
    return {
      ticketId,
      clientId,
      productId: asString(item.id) ?? asString(item.productId),
      code,
      name,
      branchCode,
      itemGroup,
      category: asString(item.category),
      subcategory: asString(item.subcategory),
      translatedCategory: asString(item.translatedCategory),
      weight: asNumber(item.weight),
      deduct: asNumber(item.deduct),
      unit: asString(item.unit),
      basePrice: asNumber(item.basePrice),
      paidPrice: asNumber(item.paidPrice),
      priceReason: asString(item.priceReason),
      priceReasonId: asString(item.priceReasonId),
      priceLocked: asBoolean(item.priceLocked),
      tierPricing: item.tierPricing ?? null,
      wastes: item.wastes ?? null,
      recordedBy: asString(item.recordedBy),
      localTimestamp: toDate(item.localTimestamp),
    };
  });
}

export function transformTicket(
  id: string,
  companyId: string,
  data: Record<string, unknown>,
  firestoreUpdateTime: Date | null
): TicketRow {
  const seller = asRecord(data.seller);
  const items = transformWeighedItems(id, data);

  return {
    id,
    companyId,
    runningNumber: asString(data.runningNumber),
    number: asNumber(data.number),
    status: asString(data.status),
    done: asBoolean(data.done),
    payment: asString(data.payment),
    paidBy: asString(data.paidBy),
    recordedBy: asString(data.recordedBy),
    beforeTax: asNumber(data.beforeTax),
    tax: asNumber(data.tax),
    taxCalculation: asString(data.taxCalculation),
    net: asNumber(data.net),
    finalRounding: asString(data.finalRounding),
    pureWeight: asNumber(data.pureWeight),
    note: asString(data.note),
    truck: data.truck === null || data.truck === undefined ? null : String(data.truck),
    productIds: asStringArray(data.productIds),
    sellerId: seller ? asString(seller.id) : null,
    sellerCode: seller ? asString(seller.code) : null,
    sellerFullname: seller ? asString(seller.fullname) : null,
    sellerSnapshot: seller,
    createdAt: toDate(data.createdAt),
    updatedAt: toDate(data.updatedAt),
    paidTimestamp: toDate(data.paidTimestamp),
    paidAt: toDate(data.paidAt),
    firestoreUpdateTime,
    items,
  };
}

const CLOSED_IN_STATUSES = new Set(["paid", "void"]);
const OPEN_OUT_STATUSES = new Set(["draft", "shipping", "accepted"]);

/** Buy ticket still in progress. `done=false` is not used — paid tickets can have done=false. */
export function isOpenInTicket(ticket: TicketRow): boolean {
  if (ticket.status === "draft") return true;
  return ticket.paidTimestamp == null && !CLOSED_IN_STATUSES.has(ticket.status ?? "");
}

/** Sell ticket not paid and not void */
export function isOpenOutTicket(ticket: OutTicketRow): boolean {
  return OPEN_OUT_STATUSES.has(ticket.status ?? "");
}

export function transformEmployee(
  id: string,
  companyId: string,
  data: Record<string, unknown>
): EmployeeRow {
  return {
    id,
    companyId,
    displayName: asString(data.name) ?? asString(data.displayName) ?? asString(data.fullname),
    email: asString(data.email),
    role: asString(data.role),
    createdAt: toDate(data.createdAt),
    raw: data,
  };
}

export function transformSeller(
  id: string,
  companyId: string,
  data: Record<string, unknown>
): SellerRow {
  return {
    id,
    companyId,
    code: asString(data.code),
    fullname: asString(data.fullname),
    tel: asString(data.tel),
    address: asString(data.address),
    type: asString(data.type),
    customerGroup: asString(data.customerGroup),
    taxId: asString(data.taxId),
    taxForBuying: asString(data.taxForBuying),
    licensePlate: asString(data.licensePlate),
    vehicleType: asString(data.vehicleType),
    vehicles: data.vehicles ?? null,
    bankName: asString(data.bankName),
    bankAccountName: asString(data.bankAccountName),
    bankAccountNumber: asString(data.bankAccountNumber),
    bankName2: asString(data.bankName2),
    bankAccountName2: asString(data.bankAccountName2),
    bankAccountNumber2: asString(data.bankAccountNumber2),
    additionalBankAccounts: data.additionalBankAccounts ?? null,
    createdAt: toDate(data.createdAt),
    raw: data,
  };
}

export function transformProduct(
  id: string,
  companyId: string,
  data: Record<string, unknown>
): ProductRow {
  const code = asString(data.code);
  const name = asString(data.name);
  const { branchCode, itemGroup } = parseCompanyProductCode(code, name);
  return {
    id,
    companyId,
    code,
    name,
    branchCode,
    itemGroup,
    category: asString(data.category),
    subcategory: asString(data.subcategory),
    unit: asString(data.unit),
    basePrice: asNumber(data.basePrice),
    kgConversion: asNumber(data.kgConversion),
    hidden: asBoolean(data.hidden),
    color: asString(data.color),
    backgroundColor: asString(data.backgroundColor),
    tierPricing: data.tierPricing ?? null,
    stockQty:
      asNumber(data.stock) ??
      asNumber(data.quantity) ??
      asNumber(data.onHand) ??
      asNumber(data.stockQty),
    createdAt: toDate(data.createdAt),
    updatedAt: toDate(data.updatedAt),
    raw: data,
  };
}

export function transformCustomerGroup(
  id: string,
  companyId: string,
  data: Record<string, unknown>
): CustomerGroupRow {
  return {
    id,
    companyId,
    name: asString(data.name),
    description: asString(data.description),
    isDefault: asBoolean(data.default),
    recordedBy: asString(data.recordedBy),
    sellers: data.sellers ?? null,
    productMap: data.productMap ?? null,
    updatedAt: toDate(data.updatedAt),
    raw: data,
  };
}

export function transformOutTicket(
  id: string,
  companyId: string,
  data: Record<string, unknown>,
  firestoreUpdateTime: Date | null
): OutTicketRow {
  const buyer = asRecord(data.buyer);
  return {
    id,
    companyId,
    number: asNumber(data.number),
    title: asString(data.title),
    status: asString(data.status),
    recordedBy: asString(data.recordedBy),
    beforeTax: asNumber(data.beforeTax),
    tax: asNumber(data.tax),
    taxCalculation: asString(data.taxCalculation),
    net: asNumber(data.net),
    finalRounding: asString(data.finalRounding),
    cost: asNumber(data.cost),
    profit: asNumber(data.profit),
    profitLoss: asNumber(data.profitLoss),
    pureWeight: asNumber(data.pureWeight),
    acceptedWeight: asNumber(data.acceptedWeight),
    weightLoss: asNumber(data.weightLoss),
    productIds: asStringArray(data.productIds),
    buyerId: buyer ? asString(buyer.id) : null,
    buyerFullname: buyer
      ? asString(buyer.fullname) ?? asString(buyer.companyName)
      : null,
    buyerSnapshot: buyer,
    truck: data.truck ?? null,
    createdAt: toDate(data.createdAt),
    updatedAt: toDate(data.updatedAt),
    paidAt: toDate(data.paidAt),
    stockUpdatedAt: toDate(data.stockUpdatedAt),
    firestoreUpdateTime,
    items: transformWeighedItems(id, data),
  };
}

function transformStockLines(
  transformId: string,
  direction: "input" | "output",
  rawLines: unknown
): StockTransformItemRow[] {
  if (!Array.isArray(rawLines)) return [];
  return rawLines.map((rawItem, lineIndex) => {
    const item = asRecord(rawItem) ?? {};
    const code = asString(item.code);
    const name = asString(item.name);
    const { branchCode, itemGroup } = parseCompanyProductCode(code, name);
    return {
      transformId,
      direction,
      lineIndex,
      productId: asString(item.id) ?? asString(item.productId),
      code,
      name,
      branchCode,
      itemGroup,
      category: asString(item.category),
      subcategory: asString(item.subcategory),
      weight: asNumber(item.weight) ?? asNumber(item.pureWeight),
      quantity: asNumber(item.quantity) ?? asNumber(item.qty),
      unit: asString(item.unit),
      raw: rawItem,
    };
  });
}

export function transformStockTransform(
  id: string,
  companyId: string,
  data: Record<string, unknown>,
  firestoreUpdateTime: Date | null
): StockTransformRow {
  return {
    id,
    companyId,
    recordedBy: asString(data.recordedBy),
    productIds: asStringArray(data.productIds),
    createdAt: toDate(data.createdAt),
    firestoreUpdateTime,
    raw: data,
    items: [
      ...transformStockLines(id, "input", data.input),
      ...transformStockLines(id, "output", data.output),
    ],
  };
}

/** Bangkok calendar month bounds as UTC Date objects for Firestore Timestamp queries */
export function bangkokMonthBounds(year: number, month: number): { start: Date; end: Date } {
  // Asia/Bangkok is UTC+7, no DST
  const start = new Date(Date.UTC(year, month - 1, 1, -7, 0, 0, 0));
  const end =
    month === 12
      ? new Date(Date.UTC(year + 1, 0, 1, -7, 0, 0, 0))
      : new Date(Date.UTC(year, month, 1, -7, 0, 0, 0));
  return { start, end };
}

/** Iterate calendar months from START_DATE to END_DATE inclusive (Bangkok months) */
export function* eachMonthInRange(startDateStr: string, endDateStr: string): Generator<{
  year: number;
  month: number;
  start: Date;
  end: Date;
  label: string;
}> {
  const startParts = startDateStr.split("-").map(Number);
  const endParts = endDateStr.split("-").map(Number);
  let y = startParts[0]!;
  let m = startParts[1]!;
  const endY = endParts[0]!;
  const endM = endParts[1]!;

  while (y < endY || (y === endY && m <= endM)) {
    const { start, end } = bangkokMonthBounds(y, m);
    const label = `${y}-${String(m).padStart(2, "0")}`;
    yield { year: y, month: m, start, end, label };
    m += 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }
  }
}

export function bangkokMonthKey(date: Date): string {
  // Format YYYY-MM in Asia/Bangkok
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Bangkok",
    year: "numeric",
    month: "2-digit",
  }).formatToParts(date);
  const year = parts.find((p) => p.type === "year")?.value ?? "0000";
  const month = parts.find((p) => p.type === "month")?.value ?? "00";
  return `${year}-${month}`;
}
