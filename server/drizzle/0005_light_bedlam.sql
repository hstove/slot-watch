ALTER TABLE "stacker_db_slots" ADD COLUMN "public_key" varchar(66);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "public_key_idx" ON "stacker_db_slots" USING btree ("public_key");