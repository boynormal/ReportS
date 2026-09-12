import pg from "pg";
import type {
  CustomerGroupRow,
  EmployeeRow,
  OutTicketRow,
  ProductRow,
  SellerRow,
  StockTransformRow,
  TicketRow,
} from "./transform.js";

const { Pool } = pg;

let pool: pg.Pool | null = null;

export function getPool(): pg.Pool {
  if (pool) return pool;
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("กรุณาตั้งค่า DATABASE_URL ใน environment / .env");
  }
  pool = new Pool({ connectionString: databaseUrl });
  return pool;
}

export async function closePool(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
  }
}

function jsonOrNull(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  return JSON.stringify(value);
}

export async function upsertTicketWithItems(ticket: TicketRow): Promise<void> {
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");

    await client.query(
      `
      INSERT INTO in_tickets (
        id, company_id, running_number, number, status, done, payment,
        paid_by, recorded_by, before_tax, tax, tax_calculation, net,
        final_rounding, pure_weight, note, truck, product_ids,
        seller_id, seller_code, seller_fullname, seller_snapshot,
        created_at, updated_at, paid_timestamp, paid_at,
        firestore_update_time, is_deleted, synced_at
      ) VALUES (
        $1,$2,$3,$4,$5,$6,$7,
        $8,$9,$10,$11,$12,$13,
        $14,$15,$16,$17,$18,
        $19,$20,$21,$22::jsonb,
        $23,$24,$25,$26,
        $27, FALSE, now()
      )
      ON CONFLICT (id) DO UPDATE SET
        company_id = EXCLUDED.company_id,
        running_number = EXCLUDED.running_number,
        number = EXCLUDED.number,
        status = EXCLUDED.status,
        done = EXCLUDED.done,
        payment = EXCLUDED.payment,
        paid_by = EXCLUDED.paid_by,
        recorded_by = EXCLUDED.recorded_by,
        before_tax = EXCLUDED.before_tax,
        tax = EXCLUDED.tax,
        tax_calculation = EXCLUDED.tax_calculation,
        net = EXCLUDED.net,
        final_rounding = EXCLUDED.final_rounding,
        pure_weight = EXCLUDED.pure_weight,
        note = EXCLUDED.note,
        truck = EXCLUDED.truck,
        product_ids = EXCLUDED.product_ids,
        seller_id = EXCLUDED.seller_id,
        seller_code = EXCLUDED.seller_code,
        seller_fullname = EXCLUDED.seller_fullname,
        seller_snapshot = EXCLUDED.seller_snapshot,
        created_at = EXCLUDED.created_at,
        updated_at = EXCLUDED.updated_at,
        paid_timestamp = EXCLUDED.paid_timestamp,
        paid_at = EXCLUDED.paid_at,
        firestore_update_time = EXCLUDED.firestore_update_time,
        is_deleted = FALSE,
        synced_at = now()
      `,
      [
        ticket.id,
        ticket.companyId,
        ticket.runningNumber,
        ticket.number,
        ticket.status,
        ticket.done,
        ticket.payment,
        ticket.paidBy,
        ticket.recordedBy,
        ticket.beforeTax,
        ticket.tax,
        ticket.taxCalculation,
        ticket.net,
        ticket.finalRounding,
        ticket.pureWeight,
        ticket.note,
        ticket.truck,
        ticket.productIds,
        ticket.sellerId,
        ticket.sellerCode,
        ticket.sellerFullname,
        jsonOrNull(ticket.sellerSnapshot),
        ticket.createdAt,
        ticket.updatedAt,
        ticket.paidTimestamp,
        ticket.paidAt,
        ticket.firestoreUpdateTime,
      ]
    );

    await client.query(`DELETE FROM in_ticket_items WHERE ticket_id = $1`, [ticket.id]);

    for (const item of ticket.items) {
      await client.query(
        `
        INSERT INTO in_ticket_items (
          ticket_id, client_id, product_id, code, name, branch_code, item_group,
          category, subcategory,
          translated_category, weight, deduct, unit, base_price, paid_price,
          price_reason, price_reason_id, price_locked, tier_pricing, wastes,
          recorded_by, local_timestamp
        ) VALUES (
          $1,$2,$3,$4,$5,$6,$7,
          $8,$9,
          $10,$11,$12,$13,$14,$15,
          $16,$17,$18,$19::jsonb,$20::jsonb,
          $21,$22
        )
        `,
        [
          item.ticketId,
          item.clientId,
          item.productId,
          item.code,
          item.name,
          item.branchCode,
          item.itemGroup,
          item.category,
          item.subcategory,
          item.translatedCategory,
          item.weight,
          item.deduct,
          item.unit,
          item.basePrice,
          item.paidPrice,
          item.priceReason,
          item.priceReasonId,
          item.priceLocked,
          jsonOrNull(item.tierPricing),
          jsonOrNull(item.wastes),
          item.recordedBy,
          item.localTimestamp,
        ]
      );
    }

    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

export async function upsertTickets(tickets: TicketRow[]): Promise<number> {
  for (const ticket of tickets) {
    await upsertTicketWithItems(ticket);
  }
  return tickets.length;
}

export async function upsertSeller(seller: SellerRow): Promise<void> {
  await getPool().query(
    `
    INSERT INTO sellers (
      id, company_id, code, fullname, tel, address, type, customer_group,
      tax_id, tax_for_buying, license_plate, vehicle_type, vehicles,
      bank_name, bank_account_name, bank_account_number,
      bank_name2, bank_account_name2, bank_account_number2,
      additional_bank_accounts, created_at, raw, synced_at
    ) VALUES (
      $1,$2,$3,$4,$5,$6,$7,$8,
      $9,$10,$11,$12,$13::jsonb,
      $14,$15,$16,
      $17,$18,$19,
      $20::jsonb,$21,$22::jsonb, now()
    )
    ON CONFLICT (id) DO UPDATE SET
      company_id = EXCLUDED.company_id,
      code = EXCLUDED.code,
      fullname = EXCLUDED.fullname,
      tel = EXCLUDED.tel,
      address = EXCLUDED.address,
      type = EXCLUDED.type,
      customer_group = EXCLUDED.customer_group,
      tax_id = EXCLUDED.tax_id,
      tax_for_buying = EXCLUDED.tax_for_buying,
      license_plate = EXCLUDED.license_plate,
      vehicle_type = EXCLUDED.vehicle_type,
      vehicles = EXCLUDED.vehicles,
      bank_name = EXCLUDED.bank_name,
      bank_account_name = EXCLUDED.bank_account_name,
      bank_account_number = EXCLUDED.bank_account_number,
      bank_name2 = EXCLUDED.bank_name2,
      bank_account_name2 = EXCLUDED.bank_account_name2,
      bank_account_number2 = EXCLUDED.bank_account_number2,
      additional_bank_accounts = EXCLUDED.additional_bank_accounts,
      created_at = EXCLUDED.created_at,
      raw = EXCLUDED.raw,
      synced_at = now()
    `,
    [
      seller.id,
      seller.companyId,
      seller.code,
      seller.fullname,
      seller.tel,
      seller.address,
      seller.type,
      seller.customerGroup,
      seller.taxId,
      seller.taxForBuying,
      seller.licensePlate,
      seller.vehicleType,
      jsonOrNull(seller.vehicles),
      seller.bankName,
      seller.bankAccountName,
      seller.bankAccountNumber,
      seller.bankName2,
      seller.bankAccountName2,
      seller.bankAccountNumber2,
      jsonOrNull(seller.additionalBankAccounts),
      seller.createdAt,
      jsonOrNull(seller.raw),
    ]
  );
}

export async function upsertSellers(sellers: SellerRow[]): Promise<number> {
  for (const seller of sellers) {
    await upsertSeller(seller);
  }
  return sellers.length;
}

export async function upsertEmployee(employee: EmployeeRow): Promise<void> {
  await getPool().query(
    `
    INSERT INTO employees (
      id, company_id, display_name, email, role, created_at, raw, synced_at
    ) VALUES (
      $1,$2,$3,$4,$5,$6,$7::jsonb, now()
    )
    ON CONFLICT (id) DO UPDATE SET
      company_id = EXCLUDED.company_id,
      display_name = COALESCE(EXCLUDED.display_name, employees.display_name),
      email = COALESCE(EXCLUDED.email, employees.email),
      role = COALESCE(EXCLUDED.role, employees.role),
      created_at = COALESCE(EXCLUDED.created_at, employees.created_at),
      raw = COALESCE(EXCLUDED.raw, employees.raw),
      synced_at = now()
    `,
    [
      employee.id,
      employee.companyId,
      employee.displayName,
      employee.email,
      employee.role,
      employee.createdAt,
      jsonOrNull(employee.raw),
    ]
  );
}

export async function upsertEmployees(employees: EmployeeRow[]): Promise<number> {
  for (const employee of employees) {
    await upsertEmployee(employee);
  }
  return employees.length;
}

/** Insert UID stubs from tickets so joins work even if employees collection is incomplete. */
export async function seedEmployeesFromTicketUids(): Promise<number> {
  const result = await getPool().query<{ count: string }>(
    `
    WITH uids AS (
      SELECT DISTINCT recorded_by AS id, company_id FROM in_tickets WHERE recorded_by IS NOT NULL AND recorded_by <> ''
      UNION
      SELECT DISTINCT paid_by, company_id FROM in_tickets WHERE paid_by IS NOT NULL AND paid_by <> ''
      UNION
      SELECT DISTINCT recorded_by, company_id FROM out_tickets WHERE recorded_by IS NOT NULL AND recorded_by <> ''
      UNION
      SELECT DISTINCT recorded_by, company_id FROM stock_transforms WHERE recorded_by IS NOT NULL AND recorded_by <> ''
      UNION
      SELECT DISTINCT recorded_by, company_id FROM customer_groups WHERE recorded_by IS NOT NULL AND recorded_by <> ''
    )
    INSERT INTO employees (id, company_id, synced_at)
    SELECT id, company_id, now() FROM uids
    ON CONFLICT (id) DO NOTHING
    `
  );
  return result.rowCount ?? 0;
}

/**
 * Soft-delete tickets in paid_timestamp range [start, end) for company
 * whose id is not in keepIds.
 */
export async function softDeleteMissingTickets(
  companyId: string,
  start: Date,
  end: Date,
  keepIds: Set<string>
): Promise<number> {
  const result = await getPool().query<{ id: string }>(
    `
    SELECT id FROM in_tickets
    WHERE company_id = $1
      AND is_deleted = FALSE
      AND paid_timestamp >= $2
      AND paid_timestamp < $3
    `,
    [companyId, start, end]
  );

  const toDelete = result.rows.map((r) => r.id).filter((id) => !keepIds.has(id));
  if (toDelete.length === 0) return 0;

  await getPool().query(
    `
    UPDATE in_tickets
    SET is_deleted = TRUE, synced_at = now()
    WHERE id = ANY($1::text[])
    `,
    [toDelete]
  );
  return toDelete.length;
}

export async function setSyncState(
  key: string,
  lastUpdatedAtCursor: Date | null,
  lastCursor: unknown = null
): Promise<void> {
  await getPool().query(
    `
    INSERT INTO sync_state (key, last_updated_at_cursor, last_synced_at, last_cursor)
    VALUES ($1, $2, now(), $3::jsonb)
    ON CONFLICT (key) DO UPDATE SET
      last_updated_at_cursor = EXCLUDED.last_updated_at_cursor,
      last_synced_at = now(),
      last_cursor = EXCLUDED.last_cursor
    `,
    [key, lastUpdatedAtCursor, jsonOrNull(lastCursor)]
  );
}

export async function getSyncState(key: string): Promise<{
  lastUpdatedAtCursor: Date | null;
} | null> {
  const result = await getPool().query<{ last_updated_at_cursor: Date | null }>(
    `SELECT last_updated_at_cursor FROM sync_state WHERE key = $1`,
    [key]
  );
  if (result.rows.length === 0) return null;
  return { lastUpdatedAtCursor: result.rows[0]!.last_updated_at_cursor };
}

export async function startSyncRun(params: {
  mode: string;
  companyId: string;
  rangeStart?: Date | null;
  rangeEnd?: Date | null;
}): Promise<number> {
  const result = await getPool().query<{ id: string }>(
    `
    INSERT INTO sync_runs (mode, company_id, range_start, range_end)
    VALUES ($1, $2, $3, $4)
    RETURNING id
    `,
    [params.mode, params.companyId, params.rangeStart ?? null, params.rangeEnd ?? null]
  );
  return Number(result.rows[0]!.id);
}

export async function finishSyncRun(
  id: number,
  stats: {
    fetched: number;
    upserted: number;
    softDeleted: number;
    error?: string | null;
  }
): Promise<void> {
  await getPool().query(
    `
    UPDATE sync_runs
    SET finished_at = now(),
        fetched = $2,
        upserted = $3,
        soft_deleted = $4,
        error = $5
    WHERE id = $1
    `,
    [id, stats.fetched, stats.upserted, stats.softDeleted, stats.error ?? null]
  );
}

export async function countActiveTicketsByPaidRange(
  companyId: string,
  start: Date,
  end: Date
): Promise<number> {
  const result = await getPool().query<{ count: string }>(
    `
    SELECT COUNT(*)::text AS count
    FROM in_tickets
    WHERE company_id = $1
      AND is_deleted = FALSE
      AND paid_timestamp >= $2
      AND paid_timestamp < $3
    `,
    [companyId, start, end]
  );
  return Number(result.rows[0]!.count);
}

export async function upsertProduct(product: ProductRow): Promise<void> {
  await getPool().query(
    `
    INSERT INTO products (
      id, company_id, code, name, branch_code, item_group, category, subcategory,
      unit, base_price,
      kg_conversion, hidden, color, background_color, tier_pricing, stock_qty,
      created_at, updated_at, raw, synced_at
    ) VALUES (
      $1,$2,$3,$4,$5,$6,$7,$8,
      $9,$10,
      $11,$12,$13,$14,$15::jsonb,$16,
      $17,$18,$19::jsonb, now()
    )
    ON CONFLICT (id) DO UPDATE SET
      company_id = EXCLUDED.company_id,
      code = EXCLUDED.code,
      name = EXCLUDED.name,
      branch_code = EXCLUDED.branch_code,
      item_group = EXCLUDED.item_group,
      category = EXCLUDED.category,
      subcategory = EXCLUDED.subcategory,
      unit = EXCLUDED.unit,
      base_price = EXCLUDED.base_price,
      kg_conversion = EXCLUDED.kg_conversion,
      hidden = EXCLUDED.hidden,
      color = EXCLUDED.color,
      background_color = EXCLUDED.background_color,
      tier_pricing = EXCLUDED.tier_pricing,
      stock_qty = EXCLUDED.stock_qty,
      created_at = EXCLUDED.created_at,
      updated_at = EXCLUDED.updated_at,
      raw = EXCLUDED.raw,
      synced_at = now()
    `,
    [
      product.id,
      product.companyId,
      product.code,
      product.name,
      product.branchCode,
      product.itemGroup,
      product.category,
      product.subcategory,
      product.unit,
      product.basePrice,
      product.kgConversion,
      product.hidden,
      product.color,
      product.backgroundColor,
      jsonOrNull(product.tierPricing),
      product.stockQty,
      product.createdAt,
      product.updatedAt,
      jsonOrNull(product.raw),
    ]
  );
}

export async function upsertProducts(products: ProductRow[]): Promise<number> {
  for (const product of products) {
    await upsertProduct(product);
  }
  return products.length;
}

export async function upsertCustomerGroup(group: CustomerGroupRow): Promise<void> {
  await getPool().query(
    `
    INSERT INTO customer_groups (
      id, company_id, name, description, is_default, recorded_by,
      sellers, product_map, updated_at, raw, synced_at
    ) VALUES (
      $1,$2,$3,$4,$5,$6,
      $7::jsonb,$8::jsonb,$9,$10::jsonb, now()
    )
    ON CONFLICT (id) DO UPDATE SET
      company_id = EXCLUDED.company_id,
      name = EXCLUDED.name,
      description = EXCLUDED.description,
      is_default = EXCLUDED.is_default,
      recorded_by = EXCLUDED.recorded_by,
      sellers = EXCLUDED.sellers,
      product_map = EXCLUDED.product_map,
      updated_at = EXCLUDED.updated_at,
      raw = EXCLUDED.raw,
      synced_at = now()
    `,
    [
      group.id,
      group.companyId,
      group.name,
      group.description,
      group.isDefault,
      group.recordedBy,
      jsonOrNull(group.sellers),
      jsonOrNull(group.productMap),
      group.updatedAt,
      jsonOrNull(group.raw),
    ]
  );
}

export async function upsertCustomerGroups(groups: CustomerGroupRow[]): Promise<number> {
  for (const group of groups) {
    await upsertCustomerGroup(group);
  }
  return groups.length;
}

export async function upsertOutTicketWithItems(ticket: OutTicketRow): Promise<void> {
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    await client.query(
      `
      INSERT INTO out_tickets (
        id, company_id, number, title, status, recorded_by,
        before_tax, tax, tax_calculation, net, final_rounding,
        cost, profit, profit_loss, pure_weight, accepted_weight, weight_loss,
        product_ids, buyer_id, buyer_fullname, buyer_snapshot, truck,
        created_at, updated_at, paid_at, stock_updated_at,
        firestore_update_time, is_deleted, synced_at
      ) VALUES (
        $1,$2,$3,$4,$5,$6,
        $7,$8,$9,$10,$11,
        $12,$13,$14,$15,$16,$17,
        $18,$19,$20,$21::jsonb,$22::jsonb,
        $23,$24,$25,$26,
        $27, FALSE, now()
      )
      ON CONFLICT (id) DO UPDATE SET
        company_id = EXCLUDED.company_id,
        number = EXCLUDED.number,
        title = EXCLUDED.title,
        status = EXCLUDED.status,
        recorded_by = EXCLUDED.recorded_by,
        before_tax = EXCLUDED.before_tax,
        tax = EXCLUDED.tax,
        tax_calculation = EXCLUDED.tax_calculation,
        net = EXCLUDED.net,
        final_rounding = EXCLUDED.final_rounding,
        cost = EXCLUDED.cost,
        profit = EXCLUDED.profit,
        profit_loss = EXCLUDED.profit_loss,
        pure_weight = EXCLUDED.pure_weight,
        accepted_weight = EXCLUDED.accepted_weight,
        weight_loss = EXCLUDED.weight_loss,
        product_ids = EXCLUDED.product_ids,
        buyer_id = EXCLUDED.buyer_id,
        buyer_fullname = EXCLUDED.buyer_fullname,
        buyer_snapshot = EXCLUDED.buyer_snapshot,
        truck = EXCLUDED.truck,
        created_at = EXCLUDED.created_at,
        updated_at = EXCLUDED.updated_at,
        paid_at = EXCLUDED.paid_at,
        stock_updated_at = EXCLUDED.stock_updated_at,
        firestore_update_time = EXCLUDED.firestore_update_time,
        is_deleted = FALSE,
        synced_at = now()
      `,
      [
        ticket.id,
        ticket.companyId,
        ticket.number,
        ticket.title,
        ticket.status,
        ticket.recordedBy,
        ticket.beforeTax,
        ticket.tax,
        ticket.taxCalculation,
        ticket.net,
        ticket.finalRounding,
        ticket.cost,
        ticket.profit,
        ticket.profitLoss,
        ticket.pureWeight,
        ticket.acceptedWeight,
        ticket.weightLoss,
        ticket.productIds,
        ticket.buyerId,
        ticket.buyerFullname,
        jsonOrNull(ticket.buyerSnapshot),
        jsonOrNull(ticket.truck),
        ticket.createdAt,
        ticket.updatedAt,
        ticket.paidAt,
        ticket.stockUpdatedAt,
        ticket.firestoreUpdateTime,
      ]
    );

    await client.query(`DELETE FROM out_ticket_items WHERE ticket_id = $1`, [ticket.id]);
    for (const item of ticket.items) {
      await client.query(
        `
        INSERT INTO out_ticket_items (
          ticket_id, client_id, product_id, code, name, branch_code, item_group,
          category, subcategory,
          translated_category, weight, deduct, unit, base_price, paid_price,
          price_reason, price_reason_id, price_locked, tier_pricing, wastes,
          recorded_by, local_timestamp
        ) VALUES (
          $1,$2,$3,$4,$5,$6,$7,
          $8,$9,
          $10,$11,$12,$13,$14,$15,
          $16,$17,$18,$19::jsonb,$20::jsonb,
          $21,$22
        )
        `,
        [
          item.ticketId,
          item.clientId,
          item.productId,
          item.code,
          item.name,
          item.branchCode,
          item.itemGroup,
          item.category,
          item.subcategory,
          item.translatedCategory,
          item.weight,
          item.deduct,
          item.unit,
          item.basePrice,
          item.paidPrice,
          item.priceReason,
          item.priceReasonId,
          item.priceLocked,
          jsonOrNull(item.tierPricing),
          jsonOrNull(item.wastes),
          item.recordedBy,
          item.localTimestamp,
        ]
      );
    }
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

export async function upsertOutTickets(tickets: OutTicketRow[]): Promise<number> {
  for (const ticket of tickets) {
    await upsertOutTicketWithItems(ticket);
  }
  return tickets.length;
}

export async function upsertStockTransform(transform: StockTransformRow): Promise<void> {
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    await client.query(
      `
      INSERT INTO stock_transforms (
        id, company_id, recorded_by, product_ids, created_at,
        firestore_update_time, is_deleted, raw, synced_at
      ) VALUES (
        $1,$2,$3,$4,$5,
        $6, FALSE, $7::jsonb, now()
      )
      ON CONFLICT (id) DO UPDATE SET
        company_id = EXCLUDED.company_id,
        recorded_by = EXCLUDED.recorded_by,
        product_ids = EXCLUDED.product_ids,
        created_at = EXCLUDED.created_at,
        firestore_update_time = EXCLUDED.firestore_update_time,
        is_deleted = FALSE,
        raw = EXCLUDED.raw,
        synced_at = now()
      `,
      [
        transform.id,
        transform.companyId,
        transform.recordedBy,
        transform.productIds,
        transform.createdAt,
        transform.firestoreUpdateTime,
        jsonOrNull(transform.raw),
      ]
    );

    await client.query(`DELETE FROM stock_transform_items WHERE transform_id = $1`, [transform.id]);
    for (const item of transform.items) {
      await client.query(
        `
        INSERT INTO stock_transform_items (
          transform_id, direction, line_index, product_id, code, name,
          branch_code, item_group, category, subcategory, weight, quantity, unit, raw
        ) VALUES (
          $1,$2,$3,$4,$5,$6,
          $7,$8,$9,$10,$11,$12,$13,$14::jsonb
        )
        `,
        [
          item.transformId,
          item.direction,
          item.lineIndex,
          item.productId,
          item.code,
          item.name,
          item.branchCode,
          item.itemGroup,
          item.category,
          item.subcategory,
          item.weight,
          item.quantity,
          item.unit,
          jsonOrNull(item.raw),
        ]
      );
    }
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

export async function upsertStockTransforms(transforms: StockTransformRow[]): Promise<number> {
  for (const transform of transforms) {
    await upsertStockTransform(transform);
  }
  return transforms.length;
}

export async function softDeleteMissingOutTickets(
  companyId: string,
  start: Date,
  end: Date,
  keepIds: Set<string>
): Promise<number> {
  const result = await getPool().query<{ id: string }>(
    `
    SELECT id FROM out_tickets
    WHERE company_id = $1
      AND is_deleted = FALSE
      AND paid_at >= $2
      AND paid_at < $3
    `,
    [companyId, start, end]
  );
  const toDelete = result.rows.map((r) => r.id).filter((id) => !keepIds.has(id));
  if (toDelete.length === 0) return 0;
  await getPool().query(
    `
    UPDATE out_tickets
    SET is_deleted = TRUE, synced_at = now()
    WHERE id = ANY($1::text[])
    `,
    [toDelete]
  );
  return toDelete.length;
}

export async function softDeleteMissingTransforms(
  companyId: string,
  start: Date,
  end: Date,
  keepIds: Set<string>
): Promise<number> {
  const result = await getPool().query<{ id: string }>(
    `
    SELECT id FROM stock_transforms
    WHERE company_id = $1
      AND is_deleted = FALSE
      AND created_at >= $2
      AND created_at < $3
    `,
    [companyId, start, end]
  );
  const toDelete = result.rows.map((r) => r.id).filter((id) => !keepIds.has(id));
  if (toDelete.length === 0) return 0;
  await getPool().query(
    `
    UPDATE stock_transforms
    SET is_deleted = TRUE, synced_at = now()
    WHERE id = ANY($1::text[])
    `,
    [toDelete]
  );
  return toDelete.length;
}

export async function countActiveOutTicketsByPaidRange(
  companyId: string,
  start: Date,
  end: Date
): Promise<number> {
  const result = await getPool().query<{ count: string }>(
    `
    SELECT COUNT(*)::text AS count
    FROM out_tickets
    WHERE company_id = $1
      AND is_deleted = FALSE
      AND paid_at >= $2
      AND paid_at < $3
    `,
    [companyId, start, end]
  );
  return Number(result.rows[0]!.count);
}
