-- Reporting views for the Scrapee dashboard
-- Re-run after formula changes: psql "$DATABASE_URL" -f sql/006_dashboard_views.sql
-- Days are calendar dates in Asia/Bangkok
-- sales_profit is out_tickets.profit — not company net profit
-- Mix grain is item-level branch_code / item_group (tickets may mix codes)
-- Item weight/amount use net warehouse weight: GREATEST(weight - deduct - wastes.weight, 0)
-- wastes may be a JSON object {weight} or an array of those objects

CREATE OR REPLACE VIEW v_daily_purchase AS
SELECT
  company_id,
  (paid_timestamp AT TIME ZONE 'Asia/Bangkok')::date AS day,
  COUNT(*)::bigint AS ticket_count,
  COALESCE(SUM(net), 0) AS net_amount,
  COALESCE(SUM(pure_weight), 0) AS weight
FROM in_tickets
WHERE is_deleted = FALSE
  AND status = 'paid'
  AND paid_timestamp IS NOT NULL
GROUP BY 1, 2;

CREATE OR REPLACE VIEW v_daily_sales AS
SELECT
  company_id,
  (paid_at AT TIME ZONE 'Asia/Bangkok')::date AS day,
  COUNT(*)::bigint AS ticket_count,
  COALESCE(SUM(net), 0) AS net_amount,
  COALESCE(SUM(cost), 0) AS cost_amount,
  COALESCE(SUM(profit), 0) AS sales_profit,
  COALESCE(SUM(pure_weight), 0) AS weight
FROM out_tickets
WHERE is_deleted = FALSE
  AND status = 'paid'
  AND paid_at IS NOT NULL
GROUP BY 1, 2;

CREATE OR REPLACE VIEW v_item_purchase_mix AS
SELECT
  t.company_id,
  (t.paid_timestamp AT TIME ZONE 'Asia/Bangkok')::date AS day,
  i.branch_code,
  i.item_group,
  COUNT(*)::bigint AS line_count,
  COUNT(DISTINCT i.ticket_id)::bigint AS ticket_count,
  COALESCE(SUM(GREATEST(COALESCE(i.weight, 0) - COALESCE(i.deduct, 0) - (
    CASE
      WHEN i.wastes IS NULL THEN 0
      WHEN jsonb_typeof(i.wastes) = 'array' THEN COALESCE((
        SELECT SUM(COALESCE(NULLIF(e->>'weight','')::numeric, 0))
        FROM jsonb_array_elements(i.wastes) e
      ), 0)
      WHEN jsonb_typeof(i.wastes) = 'object' THEN COALESCE(NULLIF(i.wastes->>'weight','')::numeric, 0)
      ELSE 0
    END
  ), 0)), 0) AS weight,
  COALESCE(SUM(GREATEST(COALESCE(i.weight, 0) - COALESCE(i.deduct, 0) - (
    CASE
      WHEN i.wastes IS NULL THEN 0
      WHEN jsonb_typeof(i.wastes) = 'array' THEN COALESCE((
        SELECT SUM(COALESCE(NULLIF(e->>'weight','')::numeric, 0))
        FROM jsonb_array_elements(i.wastes) e
      ), 0)
      WHEN jsonb_typeof(i.wastes) = 'object' THEN COALESCE(NULLIF(i.wastes->>'weight','')::numeric, 0)
      ELSE 0
    END
  ), 0) * COALESCE(i.paid_price, 0)), 0) AS line_amount
FROM in_ticket_items i
JOIN in_tickets t ON t.id = i.ticket_id
WHERE t.is_deleted = FALSE
  AND t.status = 'paid'
  AND t.paid_timestamp IS NOT NULL
GROUP BY 1, 2, 3, 4;

CREATE OR REPLACE VIEW v_item_sales_mix AS
SELECT
  t.company_id,
  (t.paid_at AT TIME ZONE 'Asia/Bangkok')::date AS day,
  i.branch_code,
  i.item_group,
  COUNT(*)::bigint AS line_count,
  COUNT(DISTINCT i.ticket_id)::bigint AS ticket_count,
  COALESCE(SUM(GREATEST(COALESCE(i.weight, 0) - COALESCE(i.deduct, 0) - (
    CASE
      WHEN i.wastes IS NULL THEN 0
      WHEN jsonb_typeof(i.wastes) = 'array' THEN COALESCE((
        SELECT SUM(COALESCE(NULLIF(e->>'weight','')::numeric, 0))
        FROM jsonb_array_elements(i.wastes) e
      ), 0)
      WHEN jsonb_typeof(i.wastes) = 'object' THEN COALESCE(NULLIF(i.wastes->>'weight','')::numeric, 0)
      ELSE 0
    END
  ), 0)), 0) AS weight,
  COALESCE(SUM(GREATEST(COALESCE(i.weight, 0) - COALESCE(i.deduct, 0) - (
    CASE
      WHEN i.wastes IS NULL THEN 0
      WHEN jsonb_typeof(i.wastes) = 'array' THEN COALESCE((
        SELECT SUM(COALESCE(NULLIF(e->>'weight','')::numeric, 0))
        FROM jsonb_array_elements(i.wastes) e
      ), 0)
      WHEN jsonb_typeof(i.wastes) = 'object' THEN COALESCE(NULLIF(i.wastes->>'weight','')::numeric, 0)
      ELSE 0
    END
  ), 0) * COALESCE(i.paid_price, 0)), 0) AS line_amount
FROM out_ticket_items i
JOIN out_tickets t ON t.id = i.ticket_id
WHERE t.is_deleted = FALSE
  AND t.status = 'paid'
  AND t.paid_at IS NOT NULL
GROUP BY 1, 2, 3, 4;

CREATE OR REPLACE VIEW v_stock_snapshot AS
SELECT
  id,
  company_id,
  code,
  name,
  branch_code,
  item_group,
  category,
  unit,
  base_price,
  stock_qty,
  COALESCE(stock_qty, 0) * COALESCE(base_price, 0) AS estimated_value,
  updated_at,
  kg_conversion,
  COALESCE(stock_qty, 0) * COALESCE(kg_conversion, 1) AS weight_kg
FROM products;
