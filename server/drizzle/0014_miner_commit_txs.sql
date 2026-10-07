CREATE TABLE "bitcoin_blocks" (
	"network_key" varchar(20) NOT NULL,
	"burn_block_hash" varchar(64) NOT NULL,
	"burn_block_height" integer NOT NULL,
	"header_timestamp" timestamp with time zone,
	"observed_at" timestamp (3) with time zone,
	"was_sortition" boolean,
	"sortition_miner_pk_hash160" varchar(40),
	"median_fee_rate" real,
	"fee_range" real[],
	"total_fees_sats" bigint,
	"tx_count" integer,
	"weight" integer,
	"pool_name" varchar,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "bitcoin_blocks_network_key_hash_pk" PRIMARY KEY("network_key","burn_block_hash")
);
--> statement-breakpoint
CREATE TABLE "mempool_fee_snapshots" (
	"network_key" varchar(20) NOT NULL,
	"observed_at" timestamp (3) with time zone NOT NULL,
	"tip_height" integer NOT NULL,
	"next_median_fee_rate" real NOT NULL,
	"next_fee_range" real[] NOT NULL,
	"next_block_vsize" integer NOT NULL,
	"second_min_fee_rate" real,
	CONSTRAINT "mempool_fee_snapshots_network_key_observed_at_pk" PRIMARY KEY("network_key","observed_at")
);
--> statement-breakpoint
CREATE TABLE "miner_commit_txs" (
	"id" varchar PRIMARY KEY NOT NULL,
	"network_key" varchar(20) NOT NULL,
	"txid" varchar(64) NOT NULL,
	"chain_input" varchar(80) NOT NULL,
	"replaces_txid" varchar(64),
	"replaced_by_txid" varchar(64),
	"chain_position" integer DEFAULT 0 NOT NULL,
	"miner_btc_address" varchar NOT NULL,
	"miner_public_key" varchar(66),
	"miner_address" varchar,
	"bid_sats" bigint NOT NULL,
	"fee_sats" bigint NOT NULL,
	"vsize" real NOT NULL,
	"fee_rate" real NOT NULL,
	"parent_height" integer NOT NULL,
	"parent_vtx" integer NOT NULL,
	"burn_modulus" integer NOT NULL,
	"first_seen_at" timestamp (3) with time zone,
	"first_seen_source" varchar(16),
	"status" varchar(16) DEFAULT 'pending' NOT NULL,
	"left_mempool_at" timestamp (3) with time zone,
	"confirmed_height" integer,
	"full_rbf" boolean,
	"reconciled_at" timestamp with time zone,
	CONSTRAINT "miner_commit_txs_network_key_txid_idx" UNIQUE("network_key","txid")
);
--> statement-breakpoint
CREATE INDEX "bitcoin_blocks_network_key_height_idx" ON "bitcoin_blocks" USING btree ("network_key","burn_block_height");--> statement-breakpoint
CREATE INDEX "miner_commit_txs_network_key_chain_input_idx" ON "miner_commit_txs" USING btree ("network_key","chain_input");--> statement-breakpoint
CREATE INDEX "miner_commit_txs_network_key_confirmed_height_idx" ON "miner_commit_txs" USING btree ("network_key","confirmed_height");--> statement-breakpoint
CREATE INDEX "miner_commit_txs_network_key_miner_address_id_idx" ON "miner_commit_txs" USING btree ("network_key","miner_address","id");