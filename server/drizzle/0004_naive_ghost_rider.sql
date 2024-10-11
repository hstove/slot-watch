ALTER TABLE "block_proposals" ADD COLUMN "chunk_id" integer;--> statement-breakpoint
ALTER TABLE "block_proposals" ADD COLUMN "miner_public_key" varchar(66);--> statement-breakpoint
ALTER TABLE "block_pushes" ADD COLUMN "chunk_id" integer;--> statement-breakpoint
ALTER TABLE "block_pushes" ADD COLUMN "miner_public_key" varchar(66);--> statement-breakpoint
ALTER TABLE "block_responses" ADD COLUMN "chunk_id" integer;--> statement-breakpoint
ALTER TABLE "block_responses" ADD COLUMN "signer_public_key" varchar(66);--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "block_proposals" ADD CONSTRAINT "block_proposals_chunk_id_stacker_db_slots_id_fk" FOREIGN KEY ("chunk_id") REFERENCES "public"."stacker_db_slots"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "block_pushes" ADD CONSTRAINT "block_pushes_chunk_id_stacker_db_slots_id_fk" FOREIGN KEY ("chunk_id") REFERENCES "public"."stacker_db_slots"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "block_responses" ADD CONSTRAINT "block_responses_chunk_id_stacker_db_slots_id_fk" FOREIGN KEY ("chunk_id") REFERENCES "public"."stacker_db_slots"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "block_proposals_chain_length_idx" ON "block_proposals" USING btree ("chain_length");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "block_proposals_chunk_id_idx" ON "block_proposals" USING btree ("chunk_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "block_proposals_miner_public_key_idx" ON "block_proposals" USING btree ("miner_public_key");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "block_pushes_chain_length_idx" ON "block_pushes" USING btree ("chain_length");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "block_pushes_chunk_id_idx" ON "block_pushes" USING btree ("chunk_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "block_pushes_miner_public_key_idx" ON "block_pushes" USING btree ("miner_public_key");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "block_responses_chunk_id_idx" ON "block_responses" USING btree ("chunk_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "block_responses_signer_public_key_idx" ON "block_responses" USING btree ("signer_public_key");