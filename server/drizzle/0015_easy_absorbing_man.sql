-- CREATE INDEX IF NOT EXISTS "stacks_blocks_tenure_change_recent_idx" ON "stacks_blocks" USING btree ("tenure_change_cause" is not null,"created_at" DESC NULLS LAST,"network_key");
CREATE INDEX IF NOT EXISTS "stacks_blocks_tenure_change_recent_idx" ON "stacks_blocks" USING btree (
  "tenure_change_cause",
  "created_at" DESC NULLS LAST,
  "network_key"
) WHERE "tenure_change_cause" IS NOT NULL;
