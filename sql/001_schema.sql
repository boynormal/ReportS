-- Scrapee sync schema — run once on localhost Postgres
-- Example: psql "postgresql://USER:PASSWORD@localhost:5432/DBNAME" -f sql/001_schema.sql

CREATE TABLE IF NOT EXISTS in_tickets (
  id                      TEXT PRIMARY KEY,
  company_id              TEXT NOT NULL,
  running_number          TEXT,
  number                  INTEGER,
  status                  TEXT,
  done                    BOOLEAN,
  payment                 TEXT,
  paid_by                 TEXT,
  recorded_by             TEXT,
  before_tax              NUMERIC(18, 4),
  tax                     NUMERIC(18, 4),
  tax_calculation         TEXT,
  net                     NUMERIC(18, 4),
  final_rounding          TEXT,
  pure_weight             NUMERIC(18, 4),
  note                    TEXT,
  truck                   TEXT,
  product_ids             TEXT[],
  seller_id               TEXT,
  seller_code             TEXT,
  seller_fullname           TEXT,
  seller_snapshot         JSONB,
  created_at              TIMESTAMPTZ,
  updated_at              TIMESTAMPTZ,
  paid_timestamp          TIMESTAMPTZ,
  paid_at                 TIMESTAMPTZ,
  firestore_update_time   TIMESTAMPTZ,
  is_deleted              BOOLEAN NOT NULL DEFAULT FALSE,
  synced_at               TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_in_tickets_company_paid
  ON in_tickets (company_id, paid_timestamp);
CREATE INDEX IF NOT EXISTS idx_in_tickets_updated
  ON in_tickets (updated_at);
CREATE INDEX IF NOT EXISTS idx_in_tickets_seller
  ON in_tickets (seller_id);
CREATE INDEX IF NOT EXISTS idx_in_tickets_not_deleted_paid
  ON in_tickets (company_id, paid_timestamp)
  WHERE is_deleted = FALSE;

CREATE TABLE IF NOT EXISTS in_ticket_items (
  ticket_id               TEXT NOT NULL REFERENCES in_tickets(id) ON DELETE CASCADE,
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

CREATE INDEX IF NOT EXISTS idx_in_ticket_items_product
  ON in_ticket_items (product_id);
CREATE INDEX IF NOT EXISTS idx_in_ticket_items_code
  ON in_ticket_items (code);

CREATE TABLE IF NOT EXISTS sellers (
  id                      TEXT PRIMARY KEY,
  company_id              TEXT NOT NULL,
  code                    TEXT,
  fullname                TEXT,
  tel                     TEXT,
  address                 TEXT,
  type                    TEXT,
  customer_group          TEXT,
  tax_id                  TEXT,
  tax_for_buying          TEXT,
  license_plate           TEXT,
  vehicle_type            TEXT,
  vehicles                JSONB,
  bank_name               TEXT,
  bank_account_name       TEXT,
  bank_account_number     TEXT,
  bank_name2              TEXT,
  bank_account_name2      TEXT,
  bank_account_number2    TEXT,
  additional_bank_accounts JSONB,
  created_at              TIMESTAMPTZ,
  raw                     JSONB,
  synced_at               TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sellers_company_code
  ON sellers (company_id, code);

CREATE TABLE IF NOT EXISTS sync_state (
  key                     TEXT PRIMARY KEY,
  last_updated_at_cursor  TIMESTAMPTZ,
  last_synced_at          TIMESTAMPTZ,
  last_cursor             JSONB
);

CREATE TABLE IF NOT EXISTS sync_runs (
  id                      BIGSERIAL PRIMARY KEY,
  mode                    TEXT NOT NULL,
  company_id              TEXT,
  started_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at             TIMESTAMPTZ,
  range_start             TIMESTAMPTZ,
  range_end               TIMESTAMPTZ,
  fetched                 INTEGER NOT NULL DEFAULT 0,
  upserted                INTEGER NOT NULL DEFAULT 0,
  soft_deleted            INTEGER NOT NULL DEFAULT 0,
  error                   TEXT
);
