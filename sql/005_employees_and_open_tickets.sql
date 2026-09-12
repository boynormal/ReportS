-- Employees + indexes/views for open-ticket alerts
-- Run once: psql "$DATABASE_URL" -f sql/005_employees_and_open_tickets.sql
-- Collection: companies/{companyId}/employees  (id = Firebase UID, fields: name, email, createdAt, buttonLayout)
-- Open buy tickets: status = draft (done=false is NOT reliable — paid tickets can have done=false)
-- Open sell tickets: status in (draft, shipping, accepted)
-- void is cancelled, not pending work

CREATE TABLE IF NOT EXISTS employees (
  id                      TEXT PRIMARY KEY,
  company_id              TEXT NOT NULL,
  display_name            TEXT,
  email                   TEXT,
  role                    TEXT,
  created_at              TIMESTAMPTZ,
  raw                     JSONB,
  synced_at               TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_employees_company
  ON employees (company_id);
CREATE INDEX IF NOT EXISTS idx_employees_company_role
  ON employees (company_id, role);

CREATE INDEX IF NOT EXISTS idx_in_tickets_company_status_created
  ON in_tickets (company_id, status, created_at);
CREATE INDEX IF NOT EXISTS idx_in_tickets_company_done_paid
  ON in_tickets (company_id, done, paid_timestamp);
CREATE INDEX IF NOT EXISTS idx_out_tickets_company_status_created
  ON out_tickets (company_id, status, created_at);

CREATE OR REPLACE VIEW v_open_in_tickets AS
SELECT
  t.id,
  t.company_id,
  t.running_number,
  t.number,
  t.status,
  t.done,
  t.net,
  t.pure_weight,
  t.recorded_by,
  rec.display_name AS recorded_by_name,
  rec.email AS recorded_by_email,
  t.paid_by,
  pay.display_name AS paid_by_name,
  t.seller_id,
  t.seller_fullname,
  t.created_at,
  t.updated_at,
  t.paid_timestamp,
  EXTRACT(EPOCH FROM (now() - t.created_at)) / 3600.0 AS age_hours
FROM in_tickets t
LEFT JOIN employees rec ON rec.id = t.recorded_by
LEFT JOIN employees pay ON pay.id = t.paid_by
WHERE t.is_deleted = FALSE
  AND (
    t.status = 'draft'
    OR (
      t.paid_timestamp IS NULL
      AND COALESCE(t.status, '') NOT IN ('paid', 'void')
    )
  );

CREATE OR REPLACE VIEW v_open_out_tickets AS
SELECT
  t.id,
  t.company_id,
  t.number,
  t.title,
  t.status,
  t.net,
  t.pure_weight,
  t.recorded_by,
  rec.display_name AS recorded_by_name,
  rec.email AS recorded_by_email,
  t.buyer_id,
  t.buyer_fullname,
  t.created_at,
  t.updated_at,
  t.paid_at,
  EXTRACT(EPOCH FROM (now() - t.created_at)) / 3600.0 AS age_hours
FROM out_tickets t
LEFT JOIN employees rec ON rec.id = t.recorded_by
WHERE t.is_deleted = FALSE
  AND t.status IN ('draft', 'shipping', 'accepted');
