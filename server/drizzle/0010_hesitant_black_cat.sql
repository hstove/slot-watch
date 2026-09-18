DROP INDEX IF EXISTS "block_responses_network_key_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "state_machine_updates_network_key_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "state_machine_updates_by_signer_latest_id_network_key_idx";--> statement-breakpoint

-- Retention pruning for uuidv7-keyed tables. `id` encodes the observation time
-- in its first 48 bits, so "older than N" is a pkey range `id < uuid7_lower_bound(cutoff)`
-- and needs no created_at column or extra index. Rows are deleted in forward time
-- windows tracked in `prune_state`, so each run is a short pkey range scan that never
-- revisits already-pruned (dead, not yet vacuumed) index entries.
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;--> statement-breakpoint
GRANT USAGE ON SCHEMA cron TO postgres;--> statement-breakpoint
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA cron TO postgres;--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "prune_state" (
  "table_name" text PRIMARY KEY,
  "keep" interval NOT NULL,
  "frontier_ms" bigint NOT NULL,
  "last_run_at" timestamptz,
  "last_rows" bigint
);--> statement-breakpoint

CREATE OR REPLACE FUNCTION uuid7_lower_bound(ms bigint) RETURNS text
LANGUAGE sql IMMUTABLE AS $$
  SELECT substr(h, 1, 8) || '-' || substr(h, 9, 4) || '-7000-8000-000000000000'
  FROM (SELECT lpad(to_hex(ms), 12, '0') AS h) x
$$;--> statement-breakpoint

CREATE OR REPLACE FUNCTION uuid7_ms(id text) RETURNS bigint
LANGUAGE sql IMMUTABLE AS $$
  SELECT ('x' || replace(substr(id, 1, 13), '-', ''))::bit(48)::bigint
$$;--> statement-breakpoint

-- Deletes up to p_max_windows windows of p_window each, starting at the table's
-- frontier and stopping at now() - keep. Returns rows deleted. Concurrent runs
-- for the same table are skipped (SKIP LOCKED).
CREATE OR REPLACE FUNCTION prune_old_rows(
  p_table text,
  p_max_windows int DEFAULT 6,
  p_window interval DEFAULT '1 hour'
) RETURNS bigint
LANGUAGE plpgsql AS $$
DECLARE
  st prune_state%ROWTYPE;
  cutoff_ms bigint;
  hi_ms bigint;
  n bigint;
  total bigint := 0;
  i int := 0;
BEGIN
  SELECT * INTO st FROM prune_state WHERE table_name = p_table FOR UPDATE SKIP LOCKED;
  IF NOT FOUND THEN
    RETURN 0;
  END IF;
  cutoff_ms := (extract(epoch FROM now() - st.keep) * 1000)::bigint;
  WHILE st.frontier_ms < cutoff_ms AND i < p_max_windows LOOP
    hi_ms := least(st.frontier_ms + (extract(epoch FROM p_window) * 1000)::bigint, cutoff_ms);
    EXECUTE format('DELETE FROM %I WHERE id >= $1 AND id < $2', p_table)
      USING uuid7_lower_bound(st.frontier_ms), uuid7_lower_bound(hi_ms);
    GET DIAGNOSTICS n = ROW_COUNT;
    total := total + n;
    st.frontier_ms := hi_ms;
    i := i + 1;
  END LOOP;
  UPDATE prune_state
    SET frontier_ms = st.frontier_ms, last_run_at = now(), last_rows = total
    WHERE table_name = p_table;
  RETURN total;
END
$$;--> statement-breakpoint
ALTER FUNCTION prune_old_rows(text, int, interval) SET statement_timeout = '10min';--> statement-breakpoint

INSERT INTO "prune_state" ("table_name", "keep", "frontier_ms")
SELECT 'block_responses', interval '3 months', uuid7_ms(min(id)) FROM block_responses
ON CONFLICT ("table_name") DO NOTHING;--> statement-breakpoint
INSERT INTO "prune_state" ("table_name", "keep", "frontier_ms")
SELECT 'state_machine_updates', interval '3 months', uuid7_ms(min(id)) FROM state_machine_updates
ON CONFLICT ("table_name") DO NOTHING;--> statement-breakpoint

-- Hourly. Steady state is ~10k block responses per hour-window, so 6 windows
-- is well under a second; it also catches up at 6x real time after downtime.
SELECT cron.schedule('prune-block-responses', '17 * * * *',
  $$SELECT prune_old_rows('block_responses', 6)$$);--> statement-breakpoint
SELECT cron.schedule('prune-state-machine-updates', '37 * * * *',
  $$SELECT prune_old_rows('state_machine_updates', 6)$$);--> statement-breakpoint

-- The tables are insert-mostly with steady deletes at the low end. Default
-- autovacuum waits for 20% dead rows; at 3-month retention that is weeks of
-- deletes before space is reused, so vacuum far earlier.
ALTER TABLE "block_responses" SET (
  autovacuum_vacuum_scale_factor = 0.02,
  autovacuum_vacuum_threshold = 20000,
  autovacuum_vacuum_insert_scale_factor = 0.05,
  autovacuum_analyze_scale_factor = 0.02
);--> statement-breakpoint
ALTER TABLE "state_machine_updates" SET (
  autovacuum_vacuum_scale_factor = 0.02,
  autovacuum_vacuum_threshold = 20000,
  autovacuum_vacuum_insert_scale_factor = 0.05,
  autovacuum_analyze_scale_factor = 0.02
);
