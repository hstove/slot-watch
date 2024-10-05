import {
	pgTable,
	serial,
	text,
	varchar,
	integer,
	smallint,
	customType,
	timestamp,
	index,
	bigint,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

const bytea = customType<{ data: Uint8Array; notNull: false; default: false }>({
	dataType() {
		return "bytea";
	},
});

export const stackerDbSlots = pgTable(
	"stacker_db_slots",
	{
		id: serial("id").primaryKey(),
		slotId: smallint("slot_id").notNull(),
		version: integer("version").notNull(),
		signature: bytea("signature").notNull(),
		data: bytea("data").notNull(),
		contractId: varchar("contract_id", { length: 255 }).notNull(),
		createdAt: timestamp("created_at").default(sql`now()`).notNull(),
		networkKey: varchar("network_key", { length: 20 }),
	},
	(table) => ({
		networkKeyIndex: index("network_key_idx").on(table.networkKey),
	}),
);

export const blockProposals = pgTable(
	"block_proposals",
	{
		id: serial("id").primaryKey(),
		signerSignatureHash: varchar("signer_signature_hash", {
			length: 64,
		}).notNull(),
		chainLength: integer("chain_length").notNull(),
		createdAt: timestamp("created_at").default(sql`now()`).notNull(),
		networkKey: varchar("network_key", { length: 20 }).notNull(),
		chunkId: integer("chunk_id").references(() => stackerDbSlots.id),
	},
	(table) => ({
		networkKeyIndex: index("block_proposals_network_key_idx").on(
			table.networkKey,
		),
		signerSignatureHashIndex: index(
			"block_proposals_signer_signature_hash_idx",
		).on(table.signerSignatureHash),
		chainLengthIndex: index("block_proposals_chain_length_idx").on(
			table.chainLength,
		),
		chunkIdIndex: index("block_proposals_chunk_id_idx").on(table.chunkId),
	}),
);

export const blockResponses = pgTable(
	"block_responses",
	{
		id: serial("id").primaryKey(),
		signerSignatureHash: varchar("signer_signature_hash", {
			length: 64,
		}).notNull(),
		slotId: smallint("slot_id").notNull(),
		createdAt: timestamp("created_at").default(sql`now()`).notNull(),
		networkKey: varchar("network_key", { length: 20 }).notNull(),
		chunkId: integer("chunk_id").references(() => stackerDbSlots.id),
	},
	(table) => ({
		networkKeyIndex: index("block_responses_network_key_idx").on(
			table.networkKey,
		),
		signerSignatureHashIndex: index(
			"block_responses_signer_signature_hash_idx",
		).on(table.signerSignatureHash),
		slotIdIndex: index("slot_id_idx").on(table.slotId),
		chunkIdIndex: index("block_responses_chunk_id_idx").on(table.chunkId),
	}),
);

export const blockPushes = pgTable(
	"block_pushes",
	{
		id: serial("id").primaryKey(),
		signerSignatureHash: varchar("signer_signature_hash", {
			length: 64,
		}).notNull(),
		chainLength: integer("chain_length").notNull(),
		createdAt: timestamp("created_at").default(sql`now()`).notNull(),
		networkKey: varchar("network_key", { length: 20 }).notNull(),
		chunkId: integer("chunk_id").references(() => stackerDbSlots.id),
	},
	(table) => ({
		networkKeyIndex: index("block_pushes_network_key_idx").on(table.networkKey),
		signerSignatureHashIndex: index(
			"block_pushes_signer_signature_hash_idx",
		).on(table.signerSignatureHash),
		chainLengthIndex: index("block_pushes_chain_length_idx").on(
			table.chainLength,
		),
		chunkIdIndex: index("block_pushes_chunk_id_idx").on(table.chunkId),
	}),
);
