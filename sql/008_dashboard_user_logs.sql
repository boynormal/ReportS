-- Admin-visible dashboard activity log
-- Re-run: psql "$DATABASE_URL" -f sql/008_dashboard_user_logs.sql

CREATE TABLE IF NOT EXISTS dashboard_user_logs (
  id            BIGSERIAL PRIMARY KEY,
  at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  line_user_id  TEXT,
  display_name  TEXT,
  role          TEXT,
  action        TEXT NOT NULL,
  path          TEXT,
  label         TEXT,
  detail        JSONB
);

CREATE INDEX IF NOT EXISTS idx_dashboard_user_logs_at
  ON dashboard_user_logs (at DESC);

CREATE INDEX IF NOT EXISTS idx_dashboard_user_logs_user
  ON dashboard_user_logs (line_user_id, at DESC);
