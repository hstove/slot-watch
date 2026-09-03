CREATE TABLE "miner_rewards" (
	"id" varchar PRIMARY KEY NOT NULL,
	"network_key" varchar(20) NOT NULL,
	"recipient" varchar NOT NULL,
	"miner_address" varchar,
	"coinbase_ustx" bigint NOT NULL,
	"tx_fees_anchored_ustx" bigint NOT NULL,
	"tx_fees_streamed_confirmed_ustx" bigint NOT NULL,
	"tx_fees_streamed_produced_ustx" bigint NOT NULL,
	"from_stacks_block_hash" varchar(64) NOT NULL,
	"from_index_block_hash" varchar(64) NOT NULL,
	"matured_block_height" integer NOT NULL,
	"matured_burn_block_height" integer NOT NULL,
	"earned_consensus_hash" varchar(64),
	"earned_burn_block_height" integer,
	CONSTRAINT "miner_rewards_network_from_index_recipient_idx" UNIQUE("network_key","from_index_block_hash","recipient")
);
--> statement-breakpoint
ALTER TABLE "burn_blocks" ADD COLUMN "burn_amount_sats" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
CREATE INDEX "miner_rewards_earned_burn_block_height_network_key_idx" ON "miner_rewards" USING btree ("network_key","earned_burn_block_height");--> statement-breakpoint
CREATE INDEX "miner_rewards_miner_address_network_key_idx" ON "miner_rewards" USING btree ("miner_address","network_key");