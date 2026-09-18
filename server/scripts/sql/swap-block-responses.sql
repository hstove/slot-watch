-- One-off: swap the rebuilt block_responses_new (rows newer than 6 months,
-- pkey + signer_signature_hash index already built) in for the 199 GB original.
-- Run as: psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -v delta_lo='<uuid7 lower bound>' -f swap-block-responses.sql
-- :delta_lo must be a uuidv7 lower bound safely before the copy's snapshot time.
-- The old table is renamed, not dropped; drop it after verifying the app.
\timing on
begin;
set local statement_timeout = '5min';
set local lock_timeout = '30s';

lock table block_responses in access exclusive mode;

insert into block_responses_new
  select * from block_responses where id >= :'delta_lo'
  on conflict do nothing;

alter table block_responses rename to block_responses_old;
alter table block_responses_old rename constraint block_responses_pkey to block_responses_old_pkey;
alter index block_responses_signer_signature_hash_idx rename to block_responses_old_signer_signature_hash_idx;
alter index block_responses_network_key_idx rename to block_responses_old_network_key_idx;

alter table block_responses_new rename to block_responses;
alter table block_responses rename constraint block_responses_new_pkey to block_responses_pkey;
alter index block_responses_new_signer_signature_hash_idx rename to block_responses_signer_signature_hash_idx;

commit;

select relname, pg_size_pretty(pg_total_relation_size(oid)) from pg_class
  where relname in ('block_responses', 'block_responses_old');
