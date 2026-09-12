-- Dashboard LINE Login users — not Scrapee employees
-- Re-run: psql "$DATABASE_URL" -f sql/007_dashboard_users.sql

CREATE TABLE IF NOT EXISTS dashboard_users (
  line_user_id   TEXT PRIMARY KEY,
  display_name   TEXT,
  picture_url    TEXT,
  role           TEXT NOT NULL DEFAULT 'viewer'
                   CHECK (role IN ('viewer', 'sync', 'admin')),
  status         TEXT NOT NULL DEFAULT 'pending'
                   CHECK (status IN ('pending', 'active', 'disabled')),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_login_at  TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_dashboard_users_status
  ON dashboard_users (status, created_at DESC);
