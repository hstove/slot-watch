CREATE TABLE "miner_spends" (
	"id" varchar PRIMARY KEY NOT NULL,
	"network_key" varchar(20) NOT NULL,
	"burn_block_height" integer NOT NULL,
	"burn_block_hash" varchar(64) NOT NULL,
	"consensus_hash" varchar(64) NOT NULL,
	"txid" varchar(64) NOT NULL,
	"spend_sats" bigint NOT NULL,
	"recipient_count" integer NOT NULL,
	"miner_public_key" varchar(66),
	"miner_address" varchar,
	CONSTRAINT "miner_spends_network_key_txid_idx" UNIQUE("network_key","txid")
);
--> statement-breakpoint
ALTER TABLE "stacks_blocks" ADD COLUMN "miner_txid" varchar(64);--> statement-breakpoint
CREATE INDEX "miner_spends_burn_block_height_network_key_idx" ON "miner_spends" USING btree ("network_key","burn_block_height");--> statement-breakpoint
CREATE INDEX "miner_spends_miner_address_network_key_idx" ON "miner_spends" USING btree ("miner_address","network_key");--> statement-breakpoint
CREATE INDEX "miner_spends_consensus_hash_network_key_idx" ON "miner_spends" USING btree ("consensus_hash","network_key");--> statement-breakpoint
CREATE INDEX "stacks_blocks_miner_txid_network_key_idx" ON "stacks_blocks" USING btree ("network_key","miner_txid");