CREATE TABLE "block_pre_commits" (
	"id" varchar PRIMARY KEY NOT NULL,
	"signer_signature_hash" varchar(64) NOT NULL,
	"slot_id" integer NOT NULL,
	"network_key" varchar(20) NOT NULL,
	"chunk_id" varchar,
	"signer_public_key" varchar(66) NOT NULL,
	"latency_ms" integer,
	"block_height" integer
);
--> statement-breakpoint
CREATE INDEX "block_pre_commits_network_key_idx" ON "block_pre_commits" USING btree ("network_key");--> statement-breakpoint
CREATE INDEX "block_pre_commits_signer_signature_hash_idx" ON "block_pre_commits" USING btree ("signer_signature_hash");