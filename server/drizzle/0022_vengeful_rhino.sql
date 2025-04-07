ALTER TABLE "block_proposals" ALTER COLUMN "tx_fees" SET DEFAULT 0;--> statement-breakpoint
ALTER TABLE "block_proposals" ALTER COLUMN "tx_fees" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "stacks_blocks" ALTER COLUMN "tx_fees" SET DEFAULT 0;--> statement-breakpoint
ALTER TABLE "stacks_blocks" ALTER COLUMN "tx_fees" SET NOT NULL;