-- Extra collections for buy/sell/stock dashboard
-- Run once: psql "$DATABASE_URL" -f sql/003_dashboard_collections.sql
-- Does not pull PO, lock-price, ATM, or users.

CREATE TABLE IF NOT EXISTS products (
  id                      TEXT PRIMARY KEY,
  company_id              TEXT NOT NULL,
  code                    TEXT,
  name                    TEXT,
  category                TEXT,
  subcategory             TEXT,
  unit                    TEXT,
  base_price              NUMERIC(18, 4),
  kg_conversion           NUMERIC(18, 6),
  hidden                  BOOLEAN,
  color                   TEXT,
  background_color        TEXT,
  tier_pricing            JSONB,
  stock_qty               NUMERIC(18, 4),
  created_at              TIMESTAMPTZ,
  updated_at              TIMESTAMPTZ,
  raw                     JSONB,
  synced_at               TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_products_company_code
  ON products (company_id, code);
CREATE INDEX IF NOT EXISTS idx_products_category
  ON products (company_id, category);

CREATE TABLE IF NOT EXISTS customer_groups (
  id                      TEXT PRIMARY KEY,
  company_id              TEXT NOT NULL,
  name                    TEXT,
  description             TEXT,
  is_default              BOOLEAN,
  recorded_by             TEXT,
  sellers                 JSONB,
  product_map             JSONB,
  updated_at              TIMESTAMPTZ,
  raw                     JSONB,
  synced_at               TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_customer_groups_company
  ON customer_groups (company_id, name);

CREATE TABLE IF NOT EXISTS out_tickets (
  id                      TEXT PRIMARY KEY,
  company_id              TEXT NOT NULL,
  number                  INTEGER,
  title                   TEXT,
  status                  TEXT,
  recorded_by             TEXT,
  before_tax              NUMERIC(18, 4),
  tax                     NUMERIC(18, 4),
  tax_calculation         TEXT,
  net                     NUMERIC(18, 4),
  final_rounding          TEXT,
  cost                    NUMERIC(18, 4),
  profit                  NUMERIC(18, 4),
  profit_loss             NUMERIC(18, 4),
  pure_weight             NUMERIC(18, 4),
  accepted_weight         NUMERIC(18, 4),
  weight_loss             NUMERIC(18, 4),
  product_ids             TEXT[],
  buyer_id                TEXT,
  buyer_fullname          TEXT,
  buyer_snapshot          JSONB,
  truck                   JSONB,
  created_at              TIMESTAMPTZ,
  updated_at              TIMESTAMPTZ,
  paid_at                 TIMESTAMPTZ,
  stock_updated_at        TIMESTAMPTZ,
  firestore_update_time   TIMESTAMPTZ,
  is_deleted              BOOLEAN NOT NULL DEFAULT FALSE,
  synced_at               TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_out_tickets_company_paid
  ON out_tickets (company_id, paid_at);
CREATE INDEX IF NOT EXISTS idx_out_tickets_updated
  ON out_tickets (updated_at);
CREATE INDEX IF NOT EXISTS idx_out_tickets_buyer
  ON out_tickets (buyer_id);
CREATE INDEX IF NOT EXISTS idx_out_tickets_not_deleted_paid
  ON out_tickets (company_id, paid_at)
  WHERE is_deleted = FALSE;

CREATE TABLE IF NOT EXISTS out_ticket_items (
  ticket_id               TEXT NOT NULL REFERENCES out_tickets(id) ON DELETE CASCADE,
  client_id               TEXT NOT NULL,
  product_id              TEXT,
  code                    TEXT,
  name                    TEXT,
  category                TEXT,
  subcategory             TEXT,
  translated_category     TEXT,
  weight                  NUMERIC(18, 4),
  deduct                  NUMERIC(18, 4),
  unit                    TEXT,
  base_price              NUMERIC(18, 4),
  paid_price              NUMERIC(18, 4),
  price_reason            TEXT,
  price_reason_id         TEXT,
  price_locked            BOOLEAN,
  tier_pricing            JSONB,
  wastes                  JSONB,
  recorded_by             TEXT,
  local_timestamp         TIMESTAMPTZ,
  PRIMARY KEY (ticket_id, client_id)
);

CREATE INDEX IF NOT EXISTS idx_out_ticket_items_product
  ON out_ticket_items (product_id);
CREATE INDEX IF NOT EXISTS idx_out_ticket_items_code
  ON out_ticket_items (code);

CREATE TABLE IF NOT EXISTS stock_transforms (
  id                      TEXT PRIMARY KEY,
  company_id              TEXT NOT NULL,
  recorded_by             TEXT,
  product_ids             TEXT[],
  created_at              TIMESTAMPTZ,
  firestore_update_time   TIMESTAMPTZ,
  is_deleted              BOOLEAN NOT NULL DEFAULT FALSE,
  raw                     JSONB,
  synced_at               TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_stock_transforms_company_created
  ON stock_transforms (company_id, created_at);
CREATE INDEX IF NOT EXISTS idx_stock_transforms_not_deleted_created
  ON stock_transforms (company_id, created_at)
  WHERE is_deleted = FALSE;

CREATE TABLE IF NOT EXISTS stock_transform_items (
  transform_id            TEXT NOT NULL REFERENCES stock_transforms(id) ON DELETE CASCADE,
  direction               TEXT NOT NULL,
  line_index              INTEGER NOT NULL,
  product_id              TEXT,
  code                    TEXT,
  name                    TEXT,
  category                TEXT,
  subcategory             TEXT,
  weight                  NUMERIC(18, 4),
  quantity                NUMERIC(18, 4),
  unit                    TEXT,
  raw                     JSONB,
  PRIMARY KEY (transform_id, direction, line_index)
);

CREATE INDEX IF NOT EXISTS idx_stock_transform_items_product
  ON stock_transform_items (product_id);
