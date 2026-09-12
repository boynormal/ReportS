-- Derive company SKU parts: branch_code + item_group
-- Pattern: {1 digit}{letters/_}{3 digits}  e.g. 3BA033, 6Pet006, 1BA_UPS005
-- Run once: psql "$DATABASE_URL" -f sql/004_product_code_parts.sql

ALTER TABLE products
  ADD COLUMN IF NOT EXISTS branch_code TEXT,
  ADD COLUMN IF NOT EXISTS item_group TEXT;

ALTER TABLE in_ticket_items
  ADD COLUMN IF NOT EXISTS branch_code TEXT,
  ADD COLUMN IF NOT EXISTS item_group TEXT;

ALTER TABLE out_ticket_items
  ADD COLUMN IF NOT EXISTS branch_code TEXT,
  ADD COLUMN IF NOT EXISTS item_group TEXT;

ALTER TABLE stock_transform_items
  ADD COLUMN IF NOT EXISTS branch_code TEXT,
  ADD COLUMN IF NOT EXISTS item_group TEXT;

CREATE INDEX IF NOT EXISTS idx_products_branch_code ON products (branch_code);
CREATE INDEX IF NOT EXISTS idx_products_item_group ON products (item_group);
CREATE INDEX IF NOT EXISTS idx_in_ticket_items_branch_code ON in_ticket_items (branch_code);
CREATE INDEX IF NOT EXISTS idx_in_ticket_items_item_group ON in_ticket_items (item_group);
CREATE INDEX IF NOT EXISTS idx_out_ticket_items_branch_code ON out_ticket_items (branch_code);
CREATE INDEX IF NOT EXISTS idx_out_ticket_items_item_group ON out_ticket_items (item_group);
CREATE INDEX IF NOT EXISTS idx_stock_transform_items_branch_code ON stock_transform_items (branch_code);
CREATE INDEX IF NOT EXISTS idx_stock_transform_items_item_group ON stock_transform_items (item_group);

-- Backfill existing rows from code, then first token of name
UPDATE products p
SET branch_code = s.m[1], item_group = s.m[2]
FROM (
  SELECT id,
    COALESCE(
      regexp_match(code, '^([0-9])([A-Za-z][A-Za-z_]*)([0-9]{3})(?:\s+|$)'),
      regexp_match(split_part(COALESCE(name, ''), ' ', 1), '^([0-9])([A-Za-z][A-Za-z_]*)([0-9]{3})$')
    ) AS m
  FROM products
) s
WHERE p.id = s.id AND s.m IS NOT NULL;

UPDATE in_ticket_items p
SET branch_code = s.m[1], item_group = s.m[2]
FROM (
  SELECT ticket_id, client_id,
    COALESCE(
      regexp_match(code, '^([0-9])([A-Za-z][A-Za-z_]*)([0-9]{3})(?:\s+|$)'),
      regexp_match(split_part(COALESCE(name, ''), ' ', 1), '^([0-9])([A-Za-z][A-Za-z_]*)([0-9]{3})$')
    ) AS m
  FROM in_ticket_items
) s
WHERE p.ticket_id = s.ticket_id AND p.client_id = s.client_id AND s.m IS NOT NULL;

UPDATE out_ticket_items p
SET branch_code = s.m[1], item_group = s.m[2]
FROM (
  SELECT ticket_id, client_id,
    COALESCE(
      regexp_match(code, '^([0-9])([A-Za-z][A-Za-z_]*)([0-9]{3})(?:\s+|$)'),
      regexp_match(split_part(COALESCE(name, ''), ' ', 1), '^([0-9])([A-Za-z][A-Za-z_]*)([0-9]{3})$')
    ) AS m
  FROM out_ticket_items
) s
WHERE p.ticket_id = s.ticket_id AND p.client_id = s.client_id AND s.m IS NOT NULL;

UPDATE stock_transform_items p
SET branch_code = s.m[1], item_group = s.m[2]
FROM (
  SELECT transform_id, direction, line_index,
    COALESCE(
      regexp_match(code, '^([0-9])([A-Za-z][A-Za-z_]*)([0-9]{3})(?:\s+|$)'),
      regexp_match(split_part(COALESCE(name, ''), ' ', 1), '^([0-9])([A-Za-z][A-Za-z_]*)([0-9]{3})$')
    ) AS m
  FROM stock_transform_items
) s
WHERE p.transform_id = s.transform_id
  AND p.direction = s.direction
  AND p.line_index = s.line_index
  AND s.m IS NOT NULL;
