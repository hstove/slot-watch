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
	boolean,
} from "drizzle-orm/pg-core";
import { sql, type InferSelectModel } from "drizzle-orm";

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
		publicKey: varchar("public_key", { length: 66 }),
	},
	(table) => [
		index("network_key_idx").on(table.networkKey),
		index("public_key_idx").on(table.publicKey),
	],
);

export type StackerDbSlotDb = InferSelectModel<typeof stackerDbSlots>;

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
		minerPublicKey: varchar("miner_public_key", { length: 66 }),
	},
	(table) => [
		index("block_proposals_network_key_idx").on(table.networkKey),
		index("block_proposals_signer_signature_hash_idx").on(
			table.signerSignatureHash,
		),
		index("block_proposals_chain_length_idx").on(table.chainLength),
		index("block_proposals_chunk_id_idx").on(table.chunkId),
		index("block_proposals_miner_public_key_idx").on(table.minerPublicKey),
	],
);

export type BlockProposalDb = InferSelectModel<typeof blockProposals>;

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
		signerPublicKey: varchar("signer_public_key", { length: 66 }),
		accepted: boolean("accepted"),
	},
	(table) => [
		index("block_responses_network_key_idx").on(table.networkKey),
		index("block_responses_signer_signature_hash_idx").on(
			table.signerSignatureHash,
		),
		index("slot_id_idx").on(table.slotId),
		index("block_responses_chunk_id_idx").on(table.chunkId),
		index("block_responses_signer_public_key_idx").on(table.signerPublicKey),
	],
);

export type BlockResponseDb = InferSelectModel<typeof blockResponses>;

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
		minerPublicKey: varchar("miner_public_key", { length: 66 }),
	},
	(table) => [
		index("block_pushes_network_key_idx").on(table.networkKey),
		index("block_pushes_signer_signature_hash_idx").on(
			table.signerSignatureHash,
		),
		index("block_pushes_chain_length_idx").on(table.chainLength),
		index("block_pushes_chunk_id_idx").on(table.chunkId),
		index("block_pushes_miner_public_key_idx").on(table.minerPublicKey),
	],
);

export type BlockPushDb = InferSelectModel<typeof blockPushes>;
