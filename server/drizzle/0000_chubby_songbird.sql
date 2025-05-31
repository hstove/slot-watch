CREATE TABLE `block_proposals` (
	`id` text PRIMARY KEY NOT NULL,
	`signer_signature_hash` text(64) NOT NULL,
	`chain_length` integer NOT NULL,
	`network_key` text(20) NOT NULL,
	`chunk_id` text,
	`miner_public_key` text(66) NOT NULL,
	`consensus_hash` text(64) NOT NULL,
	`tenure_change_cause` integer,
	`tx_count` integer NOT NULL,
	`burn_block_height` integer NOT NULL,
	`server_version` text,
	`block_timestamp` integer NOT NULL,
	`tx_fees` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE INDEX `block_proposals_network_key_idx` ON `block_proposals` (`network_key`);--> statement-breakpoint
CREATE INDEX `block_proposals_signer_signature_hash_idx` ON `block_proposals` (`signer_signature_hash`);--> statement-breakpoint
CREATE INDEX `block_proposals_chain_length_idx` ON `block_proposals` (`chain_length`);--> statement-breakpoint
CREATE INDEX `block_proposals_chunk_id_idx` ON `block_proposals` (`chunk_id`);--> statement-breakpoint
CREATE INDEX `block_proposals_miner_public_key_idx` ON `block_proposals` (`miner_public_key`);--> statement-breakpoint
CREATE INDEX `block_proposals_burn_block_height_idx` ON `block_proposals` (`burn_block_height`,`network_key`);--> statement-breakpoint
CREATE INDEX `block_proposals_consensus_hash_network_key_idx` ON `block_proposals` (`consensus_hash`,`network_key`);--> statement-breakpoint
CREATE TABLE `block_pushes` (
	`id` text PRIMARY KEY NOT NULL,
	`signer_signature_hash` text(64) NOT NULL,
	`chain_length` integer NOT NULL,
	`network_key` text(20) NOT NULL,
	`chunk_id` text,
	`miner_public_key` text(66) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `block_pushes_network_key_idx` ON `block_pushes` (`network_key`);--> statement-breakpoint
CREATE INDEX `block_pushes_signer_signature_hash_idx` ON `block_pushes` (`signer_signature_hash`);--> statement-breakpoint
CREATE INDEX `block_pushes_chain_length_idx` ON `block_pushes` (`chain_length`);--> statement-breakpoint
CREATE INDEX `block_pushes_chunk_id_idx` ON `block_pushes` (`chunk_id`);--> statement-breakpoint
CREATE INDEX `block_pushes_miner_public_key_idx` ON `block_pushes` (`miner_public_key`);--> statement-breakpoint
CREATE TABLE `block_responses` (
	`id` text PRIMARY KEY NOT NULL,
	`signer_signature_hash` text(64) NOT NULL,
	`slot_id` integer NOT NULL,
	`network_key` text(20) NOT NULL,
	`chunk_id` text,
	`signer_public_key` text(66) NOT NULL,
	`accepted` integer NOT NULL,
	`tenure_extend_timestamp` integer,
	`version` text,
	`reject_code` integer,
	`validation_code` integer,
	`reason` text,
	`reject_reason` integer,
	`latency_ms` integer
);
--> statement-breakpoint
CREATE INDEX `block_responses_network_key_idx` ON `block_responses` (`network_key`);--> statement-breakpoint
CREATE INDEX `block_responses_signer_signature_hash_idx` ON `block_responses` (`signer_signature_hash`);--> statement-breakpoint
CREATE INDEX `slot_id_idx` ON `block_responses` (`slot_id`);--> statement-breakpoint
CREATE INDEX `block_responses_chunk_id_idx` ON `block_responses` (`chunk_id`);--> statement-breakpoint
CREATE INDEX `block_responses_signer_public_key_idx` ON `block_responses` (`signer_public_key`);--> statement-breakpoint
CREATE INDEX `block_responses_max_created_by_signer_idx` ON `block_responses` (`signer_public_key`,`id`);--> statement-breakpoint
CREATE TABLE `burn_blocks` (
	`id` text PRIMARY KEY NOT NULL,
	`burn_block_height` integer NOT NULL,
	`burn_block_hash` text(64) NOT NULL,
	`network_key` text(20) NOT NULL,
	`consensus_hash` text(64) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `burn_blocks_network_key_idx` ON `burn_blocks` (`network_key`);--> statement-breakpoint
CREATE INDEX `burn_blocks_burn_block_height_idx` ON `burn_blocks` (`burn_block_height`);--> statement-breakpoint
CREATE INDEX `burn_blocks_burn_block_hash_idx` ON `burn_blocks` (`burn_block_hash`);--> statement-breakpoint
CREATE INDEX `burn_blocks_consensus_hash_network_key_idx` ON `burn_blocks` (`consensus_hash`,`network_key`);--> statement-breakpoint
CREATE UNIQUE INDEX `burn_blocks_network_key_burn_block_hash_idx` ON `burn_blocks` (`network_key`,`burn_block_hash`);--> statement-breakpoint
CREATE TABLE `stacker_db_slots` (
	`id` text PRIMARY KEY NOT NULL,
	`slot_id` integer NOT NULL,
	`version` integer NOT NULL,
	`signature` bytea NOT NULL,
	`data` bytea NOT NULL,
	`contract_id` text(255) NOT NULL,
	`network_key` text(20) NOT NULL,
	`public_key` text(66) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `network_key_idx` ON `stacker_db_slots` (`network_key`);--> statement-breakpoint
CREATE INDEX `public_key_idx` ON `stacker_db_slots` (`public_key`);--> statement-breakpoint
CREATE INDEX `stackerdb_slots_created_at_network_key_idx` ON `stacker_db_slots` (`id`,`network_key`);--> statement-breakpoint
CREATE TABLE `stacks_blocks` (
	`id` text PRIMARY KEY NOT NULL,
	`block_height` integer NOT NULL,
	`block_hash` text(64) NOT NULL,
	`burn_block_height` integer NOT NULL,
	`burn_block_hash` text(64) NOT NULL,
	`network_key` text(20) NOT NULL,
	`tenure_change_cause` integer,
	`block_timestamp` integer NOT NULL,
	`burn_block_timestamp` integer NOT NULL,
	`index_block_hash` text(64) NOT NULL,
	`tx_count` integer NOT NULL,
	`tx_fees` integer DEFAULT 0 NOT NULL,
	`read_count` integer NOT NULL,
	`read_length` integer NOT NULL,
	`runtime` integer NOT NULL,
	`write_count` integer NOT NULL,
	`write_length` integer NOT NULL,
	`consensus_hash` text(64) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `stacks_blocks_network_key_idx` ON `stacks_blocks` (`network_key`);--> statement-breakpoint
CREATE INDEX `stacks_blocks_block_height_idx` ON `stacks_blocks` (`block_height`);--> statement-breakpoint
CREATE INDEX `stacks_blocks_block_hash_idx` ON `stacks_blocks` (`block_hash`);--> statement-breakpoint
CREATE INDEX `stacks_blocks_burn_block_hash_idx` ON `stacks_blocks` (`burn_block_hash`);--> statement-breakpoint
CREATE INDEX `stacks_blocks_tenure_change_recent_idx` ON `stacks_blocks` (`tenure_change_cause`,`id`,`network_key`) WHERE "stacks_blocks"."tenure_change_cause" is not null;--> statement-breakpoint
CREATE INDEX `stacks_blocks_consensus_hash_network_key_idx` ON `stacks_blocks` (`consensus_hash`,`network_key`);--> statement-breakpoint
CREATE UNIQUE INDEX `stacks_blocks_network_key_block_hash_idx` ON `stacks_blocks` (`network_key`,`block_hash`);--> statement-breakpoint
CREATE TABLE `state_machine_updates` (
	`id` text PRIMARY KEY NOT NULL,
	`signer_public_key` text(66) NOT NULL,
	`network_key` text(20) NOT NULL,
	`local_signer_protocol_version` integer NOT NULL,
	`active_signer_protocol_version` integer NOT NULL,
	`update_content` text NOT NULL,
	`chunk_id` text
);
--> statement-breakpoint
CREATE INDEX `state_machine_updates_network_key_idx` ON `state_machine_updates` (`network_key`);--> statement-breakpoint
CREATE INDEX `state_machine_updates_signer_public_key_idx` ON `state_machine_updates` (`signer_public_key`);--> statement-breakpoint
CREATE INDEX `state_machine_updates_by_signer_latest_idx` ON `state_machine_updates` (`signer_public_key`,`network_key`);