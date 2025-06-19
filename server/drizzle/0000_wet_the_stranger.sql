CREATE TABLE "block_proposals" (
	"id" varchar PRIMARY KEY NOT NULL,
	"signer_signature_hash" varchar(64) NOT NULL,
	"chain_length" integer NOT NULL,
	"network_key" varchar(20) NOT NULL,
	"chunk_id" varchar,
	"miner_public_key" varchar(66) NOT NULL,
	"consensus_hash" varchar(64) NOT NULL,
	"tenure_change_cause" integer,
	"tx_count" integer NOT NULL,
	"burn_block_height" integer NOT NULL,
	"server_version" varchar,
	"block_timestamp" timestamp NOT NULL,
	"tx_fees" bigint DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "block_pushes" (
	"id" varchar PRIMARY KEY NOT NULL,
	"signer_signature_hash" varchar(64) NOT NULL,
	"chain_length" integer NOT NULL,
	"network_key" varchar(20) NOT NULL,
	"chunk_id" varchar,
	"miner_public_key" varchar(66) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "block_responses" (
	"id" varchar PRIMARY KEY NOT NULL,
	"signer_signature_hash" varchar(64) NOT NULL,
	"slot_id" integer NOT NULL,
	"network_key" varchar(20) NOT NULL,
	"chunk_id" varchar,
	"signer_public_key" varchar(66) NOT NULL,
	"accepted" boolean NOT NULL,
	"tenure_extend_timestamp" timestamp,
	"version" varchar,
	"reject_code" integer,
	"validation_code" integer,
	"reason" varchar,
	"reject_reason" integer,
	"latency_ms" integer
);
--> statement-breakpoint
CREATE TABLE "burn_blocks" (
	"id" varchar PRIMARY KEY NOT NULL,
	"burn_block_height" integer NOT NULL,
	"burn_block_hash" varchar(64) NOT NULL,
	"network_key" varchar(20) NOT NULL,
	"consensus_hash" varchar(64) NOT NULL,
	CONSTRAINT "burn_blocks_network_key_burn_block_hash_idx" UNIQUE("network_key","burn_block_hash")
);
--> statement-breakpoint
CREATE TABLE "stacker_db_slots" (
	"id" varchar PRIMARY KEY NOT NULL,
	"slot_id" integer NOT NULL,
	"version" integer NOT NULL,
	"signature" "bytea" NOT NULL,
	"data" "bytea" NOT NULL,
	"contract_id" varchar(255) NOT NULL,
	"network_key" varchar(20) NOT NULL,
	"public_key" varchar(66) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "stacks_blocks" (
	"id" varchar PRIMARY KEY NOT NULL,
	"block_height" integer NOT NULL,
	"block_hash" varchar(64) NOT NULL,
	"burn_block_height" integer NOT NULL,
	"burn_block_hash" varchar(64) NOT NULL,
	"network_key" varchar(20) NOT NULL,
	"tenure_change_cause" integer,
	"block_timestamp" timestamp NOT NULL,
	"burn_block_timestamp" timestamp NOT NULL,
	"index_block_hash" varchar(64) NOT NULL,
	"tx_count" integer NOT NULL,
	"tx_fees" bigint DEFAULT 0 NOT NULL,
	"read_count" bigint NOT NULL,
	"read_length" bigint NOT NULL,
	"runtime" bigint NOT NULL,
	"write_count" bigint NOT NULL,
	"write_length" bigint NOT NULL,
	"consensus_hash" varchar(64) NOT NULL,
	CONSTRAINT "stacks_blocks_network_key_block_hash_idx" UNIQUE("network_key","block_hash")
);
--> statement-breakpoint
CREATE TABLE "state_machine_updates" (
	"id" varchar PRIMARY KEY NOT NULL,
	"signer_public_key" varchar(66) NOT NULL,
	"network_key" varchar(20) NOT NULL,
	"local_signer_protocol_version" integer NOT NULL,
	"active_signer_protocol_version" integer NOT NULL,
	"update_content" json NOT NULL,
	"chunk_id" varchar
);
--> statement-breakpoint
CREATE INDEX "block_proposals_network_key_idx" ON "block_proposals" USING btree ("network_key");--> statement-breakpoint
CREATE INDEX "block_proposals_signer_signature_hash_idx" ON "block_proposals" USING btree ("signer_signature_hash");--> statement-breakpoint
CREATE INDEX "block_proposals_chain_length_idx" ON "block_proposals" USING btree ("chain_length");--> statement-breakpoint
CREATE INDEX "block_proposals_chunk_id_idx" ON "block_proposals" USING btree ("chunk_id");--> statement-breakpoint
CREATE INDEX "block_proposals_miner_public_key_idx" ON "block_proposals" USING btree ("miner_public_key");--> statement-breakpoint
CREATE INDEX "block_proposals_burn_block_height_idx" ON "block_proposals" USING btree ("burn_block_height","network_key");--> statement-breakpoint
CREATE INDEX "block_proposals_consensus_hash_network_key_idx" ON "block_proposals" USING btree ("consensus_hash","network_key");--> statement-breakpoint
CREATE INDEX "block_proposals_by_consensus_hash_idx" ON "block_proposals" USING btree ("consensus_hash","network_key","chain_length","id");--> statement-breakpoint
CREATE INDEX "block_pushes_network_key_idx" ON "block_pushes" USING btree ("network_key");--> statement-breakpoint
CREATE INDEX "block_pushes_signer_signature_hash_idx" ON "block_pushes" USING btree ("signer_signature_hash");--> statement-breakpoint
CREATE INDEX "block_pushes_chain_length_idx" ON "block_pushes" USING btree ("chain_length");--> statement-breakpoint
CREATE INDEX "block_pushes_chunk_id_idx" ON "block_pushes" USING btree ("chunk_id");--> statement-breakpoint
CREATE INDEX "block_pushes_miner_public_key_idx" ON "block_pushes" USING btree ("miner_public_key");--> statement-breakpoint
CREATE INDEX "block_responses_network_key_idx" ON "block_responses" USING btree ("network_key");--> statement-breakpoint
CREATE INDEX "block_responses_signer_signature_hash_idx" ON "block_responses" USING btree ("signer_signature_hash");--> statement-breakpoint
CREATE INDEX "slot_id_idx" ON "block_responses" USING btree ("slot_id");--> statement-breakpoint
CREATE INDEX "block_responses_chunk_id_idx" ON "block_responses" USING btree ("chunk_id");--> statement-breakpoint
CREATE INDEX "block_responses_signer_public_key_idx" ON "block_responses" USING btree ("signer_public_key");--> statement-breakpoint
CREATE INDEX "block_responses_max_created_by_signer_idx" ON "block_responses" USING btree ("signer_public_key","id");--> statement-breakpoint
CREATE INDEX "burn_blocks_network_key_idx" ON "burn_blocks" USING btree ("network_key");--> statement-breakpoint
CREATE INDEX "burn_blocks_burn_block_height_idx" ON "burn_blocks" USING btree ("burn_block_height");--> statement-breakpoint
CREATE INDEX "burn_blocks_burn_block_hash_idx" ON "burn_blocks" USING btree ("burn_block_hash");--> statement-breakpoint
CREATE INDEX "burn_blocks_consensus_hash_network_key_idx" ON "burn_blocks" USING btree ("consensus_hash","network_key");--> statement-breakpoint
CREATE INDEX "network_key_idx" ON "stacker_db_slots" USING btree ("network_key");--> statement-breakpoint
CREATE INDEX "public_key_idx" ON "stacker_db_slots" USING btree ("public_key");--> statement-breakpoint
CREATE INDEX "stackerdb_slots_created_at_network_key_idx" ON "stacker_db_slots" USING btree ("id","network_key");--> statement-breakpoint
CREATE INDEX "stacks_blocks_network_key_idx" ON "stacks_blocks" USING btree ("network_key");--> statement-breakpoint
CREATE INDEX "stacks_blocks_block_height_idx" ON "stacks_blocks" USING btree ("block_height");--> statement-breakpoint
CREATE INDEX "stacks_blocks_block_hash_idx" ON "stacks_blocks" USING btree ("block_hash");--> statement-breakpoint
CREATE INDEX "stacks_blocks_burn_block_hash_idx" ON "stacks_blocks" USING btree ("burn_block_hash");--> statement-breakpoint
CREATE INDEX "stacks_blocks_tenure_change_recent_idx" ON "stacks_blocks" USING btree ("tenure_change_cause","id","network_key") WHERE "stacks_blocks"."tenure_change_cause" is not null;--> statement-breakpoint
CREATE INDEX "stacks_blocks_consensus_hash_network_key_idx" ON "stacks_blocks" USING btree ("consensus_hash","network_key");--> statement-breakpoint
CREATE INDEX "state_machine_updates_network_key_idx" ON "state_machine_updates" USING btree ("network_key");--> statement-breakpoint
CREATE INDEX "state_machine_updates_signer_public_key_idx" ON "state_machine_updates" USING btree ("signer_public_key");--> statement-breakpoint
CREATE INDEX "state_machine_updates_by_signer_latest_id_network_key_idx" ON "state_machine_updates" USING btree ("signer_public_key","network_key","id");