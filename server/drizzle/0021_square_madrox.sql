ALTER TABLE "block_proposals" ADD COLUMN "tx_fees" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "stacks_blocks" ADD COLUMN "tx_fees" bigint DEFAULT 0 NOT NULL;