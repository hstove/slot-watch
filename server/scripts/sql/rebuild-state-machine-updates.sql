-- Run 2026-09-18 (161 GB -> 0.6 GB). Same recipe used for block_responses on 2026-09-18: rebuild
-- state_machine_updates (161 GB, ~104M rows, ~99% older than 3 months) from
-- the rows we keep, then swap. Only the newest few hundred rows are ever read
-- (latest-per-signer views and a cursor-paginated list).
--
-- Run each step through the pooler host (session mode, port 5432) with
-- statement_timeout = 0; the direct host drops connections idle > 2 min.
-- Replace :keep_lo with uuid7_lower_bound(now() - interval '3 months'), e.g.
--   select substr(h,1,8)||'-'||substr(h,9,4)||'-7000-8000-000000000000'
--   from (select lpad(to_hex((extract(epoch from now() - interval '3 months')*1000)::bigint),12,'0') h) x;

-- 1. copy (fast: ~1M rows)
create table state_machine_updates_new (like state_machine_updates including defaults including constraints excluding indexes);
insert into state_machine_updates_new
  select * from state_machine_updates where id >= :'keep_lo' order by id;
alter table state_machine_updates_new add constraint state_machine_updates_new_pkey primary key (id);
analyze state_machine_updates_new;

-- 2. swap (delta_lo = a uuid7 bound ~1h before step 1 started)
begin;
set local lock_timeout = '30s';
lock table state_machine_updates in access exclusive mode;
insert into state_machine_updates_new
  select * from state_machine_updates where id >= :'delta_lo' on conflict do nothing;
alter table state_machine_updates rename to state_machine_updates_old;
alter table state_machine_updates_old rename constraint state_machine_updates_pkey to state_machine_updates_old_pkey;
alter index state_machine_updates_network_key_idx rename to state_machine_updates_old_network_key_idx;
alter index state_machine_updates_by_signer_latest_id_network_key_idx rename to state_machine_updates_old_by_signer_idx;
alter table state_machine_updates_new rename to state_machine_updates;
alter table state_machine_updates rename constraint state_machine_updates_new_pkey to state_machine_updates_pkey;
commit;

-- 3. after verifying /mainnet/state-machine-updates and the MCP tools:
-- drop table state_machine_updates_old;
-- insert into prune_state (table_name, keep, frontier_ms)
--   select 'state_machine_updates', interval '3 months', uuid7_ms(min(id)) from state_machine_updates;
-- select cron.schedule('prune-state-machine-updates', '37 * * * *', $$select prune_old_rows('state_machine_updates', 6)$$);
