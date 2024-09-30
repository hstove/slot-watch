ALTER TABLE "stacker_db_slots" ADD COLUMN "network_key" varchar(20);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "network_key_idx" ON "stacker_db_slots" USING btree ("network_key");