-- Run as postgres superuser once:
--   psql -U postgres -d scrapee -f sql/002_grant_admin.sql

GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO admin;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO admin;
GRANT USAGE, CREATE ON SCHEMA public TO admin;

ALTER TABLE in_tickets OWNER TO admin;
ALTER TABLE in_ticket_items OWNER TO admin;
ALTER TABLE sellers OWNER TO admin;
ALTER TABLE sync_state OWNER TO admin;
ALTER TABLE sync_runs OWNER TO admin;

ALTER SEQUENCE IF EXISTS sync_runs_id_seq OWNER TO admin;
