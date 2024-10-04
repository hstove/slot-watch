CREATE TABLE IF NOT EXISTS "block_proposals" (
	"id" serial PRIMARY KEY NOT NULL,
	"signer_signature_hash" varchar(64) NOT NULL,
	"chain_length" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"network_key" varchar(20) NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "block_pushes" (
	"id" serial PRIMARY KEY NOT NULL,
	"signer_signature_hash" varchar(64) NOT NULL,
	"chain_length" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"network_key" varchar(20) NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "block_responses" (
	"id" serial PRIMARY KEY NOT NULL,
	"signer_signature_hash" varchar(64) NOT NULL,
	"slot_id" smallint NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"network_key" varchar(20) NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "block_proposals_network_key_idx" ON "block_proposals" USING btree ("network_key");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "block_proposals_signer_signature_hash_idx" ON "block_proposals" USING btree ("signer_signature_hash");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "block_pushes_network_key_idx" ON "block_pushes" USING btree ("network_key");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "block_pushes_signer_signature_hash_idx" ON "block_pushes" USING btree ("signer_signature_hash");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "block_responses_network_key_idx" ON "block_responses" USING btree ("network_key");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "block_responses_signer_signature_hash_idx" ON "block_responses" USING btree ("signer_signature_hash");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "slot_id_idx" ON "block_responses" USING btree ("slot_id");