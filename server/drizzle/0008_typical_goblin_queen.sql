DROP INDEX "stacks_blocks_miner_txid_network_key_idx";--> statement-breakpoint
ALTER TABLE "burn_blocks" ADD COLUMN "winning_txid" varchar(64);--> statement-breakpoint
ALTER TABLE "stacks_blocks" DROP COLUMN "miner_txid";