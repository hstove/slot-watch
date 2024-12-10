ALTER TABLE "block_responses" ADD COLUMN "version" varchar;--> statement-breakpoint
ALTER TABLE "block_responses" ADD COLUMN "reject_code" smallint;--> statement-breakpoint
ALTER TABLE "block_responses" ADD COLUMN "validation_code" smallint;--> statement-breakpoint
ALTER TABLE "block_responses" ADD COLUMN "reason" varchar;