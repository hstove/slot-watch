ALTER TABLE "burn_blocks" ADD COLUMN "consensus_hash" varchar(64);--> statement-breakpoint
ALTER TABLE "stacks_blocks" ADD COLUMN "consensus_hash" varchar(64);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "block_proposals_consensus_hash_network_key_idx" ON "block_proposals" USING btree ("consensus_hash","network_key");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "burn_blocks_consensus_hash_network_key_idx" ON "burn_blocks" USING btree ("consensus_hash","network_key");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "stacks_blocks_consensus_hash_network_key_idx" ON "stacks_blocks" USING btree ("consensus_hash","network_key");