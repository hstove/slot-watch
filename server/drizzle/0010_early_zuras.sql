CREATE TABLE IF NOT EXISTS "burn_blocks" (
	"id" serial PRIMARY KEY NOT NULL,
	"burn_block_height" integer NOT NULL,
	"burn_block_hash" varchar(64) NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"network_key" varchar(20) NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "stacks_blocks" (
	"id" serial PRIMARY KEY NOT NULL,
	"block_height" integer NOT NULL,
	"block_hash" varchar(64) NOT NULL,
	"burn_block_height" integer NOT NULL,
	"burn_block_hash" varchar(64) NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"network_key" varchar(20) NOT NULL,
	"tenure_change_cause" smallint,
	"block_timestamp" timestamp,
	"burn_block_timestamp" timestamp NOT NULL,
	"index_block_hash" varchar(64),
	"tx_count" smallint NOT NULL,
	"read_count" bigint NOT NULL,
	"read_length" bigint NOT NULL,
	"runtime" bigint NOT NULL,
	"write_count" bigint NOT NULL,
	"write_length" bigint NOT NULL
);
--> statement-breakpoint
ALTER TABLE "block_proposals" ADD COLUMN "tenure_change_cause" smallint;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "burn_blocks_network_key_idx" ON "burn_blocks" USING btree ("network_key");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "burn_blocks_burn_block_height_idx" ON "burn_blocks" USING btree ("burn_block_height");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "burn_blocks_created_at_idx" ON "burn_blocks" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "burn_blocks_burn_block_hash_idx" ON "burn_blocks" USING btree ("burn_block_hash");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "stacks_blocks_network_key_idx" ON "stacks_blocks" USING btree ("network_key");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "stacks_blocks_block_height_idx" ON "stacks_blocks" USING btree ("block_height");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "stacks_blocks_created_at_idx" ON "stacks_blocks" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "stacks_blocks_block_hash_idx" ON "stacks_blocks" USING btree ("block_hash");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "stacks_blocks_burn_block_hash_idx" ON "stacks_blocks" USING btree ("burn_block_hash");