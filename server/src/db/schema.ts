import {
  pgTable,
  serial,
  varchar,
  integer,
  smallint,
  customType,
  timestamp,
  index,
  bigint,
  boolean,
  unique,
  json,
} from 'drizzle-orm/pg-core';
import { isNotNull, sql, type InferSelectModel } from 'drizzle-orm';
import type { StateMachineUpdate, SuperJSON } from 'slot-watch-common';

const bytea = customType<{ data: Uint8Array; notNull: false; default: false }>({
  dataType() {
    return 'bytea';
  },
});

export const stackerDbSlots = pgTable(
  'stacker_db_slots',
  {
    id: serial('id').primaryKey(),
    slotId: smallint('slot_id').notNull(),
    version: integer('version').notNull(),
    signature: bytea('signature').notNull(),
    data: bytea('data').notNull(),
    contractId: varchar('contract_id', { length: 255 }).notNull(),
    createdAt: timestamp('created_at').default(sql`now()`).notNull(),
    networkKey: varchar('network_key', { length: 20 }),
    publicKey: varchar('public_key', { length: 66 }),
  },
  (table) => [
    index('network_key_idx').on(table.networkKey),
    index('public_key_idx').on(table.publicKey),
    index('created_at_network_key_idx').on(
      table.networkKey,
      table.createdAt.desc(),
    ),
  ],
);

export type StackerDbSlotDb = InferSelectModel<typeof stackerDbSlots>;

export const blockProposals = pgTable(
  'block_proposals',
  {
    id: serial('id').primaryKey(),
    signerSignatureHash: varchar('signer_signature_hash', {
      length: 64,
    }).notNull(),
    chainLength: integer('chain_length').notNull(),
    createdAt: timestamp('created_at').default(sql`now()`).notNull(),
    networkKey: varchar('network_key', { length: 20 }).notNull(),
    chunkId: integer('chunk_id').references(() => stackerDbSlots.id),
    minerPublicKey: varchar('miner_public_key', { length: 66 }),
    consensusHash: varchar('consensus_hash', { length: 64 }),
    tenureChangeCause: smallint('tenure_change_cause'),
    txCount: integer('tx_count'),
    burnBlockHeight: integer('burn_block_height'),
    serverVersion: varchar('server_version'),
    blockTimestamp: timestamp('block_timestamp'),
    txFees: bigint('tx_fees', { mode: 'number' }).default(0).notNull(),
  },
  (table) => [
    index('block_proposals_network_key_idx').on(table.networkKey),
    index('block_proposals_signer_signature_hash_idx').on(
      table.signerSignatureHash,
    ),
    index('block_proposals_chain_length_idx').on(table.chainLength),
    index('block_proposals_chunk_id_idx').on(table.chunkId),
    index('block_proposals_miner_public_key_idx').on(table.minerPublicKey),
    index('block_proposals_burn_block_height_idx').on(
      table.burnBlockHeight,
      table.networkKey,
    ),
    index('block_proposals_consensus_hash_network_key_idx').on(
      table.consensusHash,
      table.networkKey,
    ),
  ],
);

export type BlockProposalDb = InferSelectModel<typeof blockProposals>;

export const blockResponses = pgTable(
  'block_responses',
  {
    id: serial('id').primaryKey(),
    signerSignatureHash: varchar('signer_signature_hash', {
      length: 64,
    }).notNull(),
    slotId: smallint('slot_id').notNull(),
    createdAt: timestamp('created_at').default(sql`now()`).notNull(),
    networkKey: varchar('network_key', { length: 20 }).notNull(),
    chunkId: integer('chunk_id').references(() => stackerDbSlots.id),
    signerPublicKey: varchar('signer_public_key', { length: 66 }),
    accepted: boolean('accepted'),
    tenureExtendTimestamp: timestamp('tenure_extend_timestamp'),
    version: varchar('version'),
    rejectCode: smallint('reject_code'),
    validationCode: smallint('validation_code'),
    reason: varchar('reason'),
    rejectReason: smallint('reject_reason'),
  },
  (table) => [
    index('block_responses_network_key_idx').on(table.networkKey),
    index('block_responses_signer_signature_hash_idx').on(
      table.signerSignatureHash,
    ),
    index('slot_id_idx').on(table.slotId),
    index('block_responses_chunk_id_idx').on(table.chunkId),
    index('block_responses_signer_public_key_idx').on(table.signerPublicKey),
    index('block_responses_max_created_by_signer_idx').on(
      table.signerPublicKey,
      table.createdAt.desc(),
    ),
  ],
);

export type BlockResponseDb = InferSelectModel<typeof blockResponses>;

export const blockPushes = pgTable(
  'block_pushes',
  {
    id: serial('id').primaryKey(),
    signerSignatureHash: varchar('signer_signature_hash', {
      length: 64,
    }).notNull(),
    chainLength: integer('chain_length').notNull(),
    createdAt: timestamp('created_at').default(sql`now()`).notNull(),
    networkKey: varchar('network_key', { length: 20 }).notNull(),
    chunkId: integer('chunk_id').references(() => stackerDbSlots.id),
    minerPublicKey: varchar('miner_public_key', { length: 66 }),
  },
  (table) => [
    index('block_pushes_network_key_idx').on(table.networkKey),
    index('block_pushes_signer_signature_hash_idx').on(
      table.signerSignatureHash,
    ),
    index('block_pushes_chain_length_idx').on(table.chainLength),
    index('block_pushes_chunk_id_idx').on(table.chunkId),
    index('block_pushes_miner_public_key_idx').on(table.minerPublicKey),
  ],
);

export type BlockPushDb = InferSelectModel<typeof blockPushes>;

export const stacksBlocks = pgTable(
  'stacks_blocks',
  {
    id: serial('id').primaryKey(),
    blockHeight: integer('block_height').notNull(),
    blockHash: varchar('block_hash', { length: 64 }).notNull(),
    burnBlockHeight: integer('burn_block_height').notNull(),
    burnBlockHash: varchar('burn_block_hash', { length: 64 }).notNull(),
    createdAt: timestamp('created_at').default(sql`now()`).notNull(),
    networkKey: varchar('network_key', { length: 20 }).notNull(),
    tenureChangeCause: smallint('tenure_change_cause'),
    blockTimestamp: timestamp('block_timestamp'),
    burnBlockTimestamp: timestamp('burn_block_timestamp').notNull(),
    indexBlockHash: varchar('index_block_hash', { length: 64 }),
    txCount: smallint('tx_count').notNull(),
    txFees: bigint('tx_fees', { mode: 'number' }).default(0).notNull(),
    readCount: bigint('read_count', { mode: 'number' }).notNull(),
    readLength: bigint('read_length', { mode: 'number' }).notNull(),
    runtime: bigint('runtime', { mode: 'number' }).notNull(),
    writeCount: bigint('write_count', { mode: 'number' }).notNull(),
    writeLength: bigint('write_length', { mode: 'number' }).notNull(),
    consensusHash: varchar('consensus_hash', { length: 64 }),
  },
  (table) => [
    index('stacks_blocks_network_key_idx').on(table.networkKey),
    index('stacks_blocks_block_height_idx').on(table.blockHeight),
    index('stacks_blocks_created_at_idx').on(table.createdAt),
    index('stacks_blocks_block_hash_idx').on(table.blockHash),
    index('stacks_blocks_burn_block_hash_idx').on(table.burnBlockHash),
    unique('stacks_blocks_network_key_block_hash_idx').on(
      table.networkKey,
      table.blockHash,
    ),
    index('stacks_blocks_tenure_change_recent_idx')
      .on(table.tenureChangeCause, table.createdAt.desc(), table.networkKey)
      .where(isNotNull(table.tenureChangeCause)),
    index('stacks_blocks_consensus_hash_network_key_idx').on(
      table.consensusHash,
      table.networkKey,
    ),
  ],
);

export type StacksBlockDb = InferSelectModel<typeof stacksBlocks>;

export const burnBlocks = pgTable(
  'burn_blocks',
  {
    id: serial('id').primaryKey(),
    burnBlockHeight: integer('burn_block_height').notNull(),
    burnBlockHash: varchar('burn_block_hash', { length: 64 }).notNull(),
    createdAt: timestamp('created_at').default(sql`now()`).notNull(),
    networkKey: varchar('network_key', { length: 20 }).notNull(),
    consensusHash: varchar('consensus_hash', { length: 64 }),
  },
  (table) => [
    index('burn_blocks_network_key_idx').on(table.networkKey),
    index('burn_blocks_burn_block_height_idx').on(table.burnBlockHeight),
    index('burn_blocks_created_at_idx').on(table.createdAt),
    index('burn_blocks_burn_block_hash_idx').on(table.burnBlockHash),
    unique('burn_blocks_network_key_burn_block_hash_idx').on(
      table.networkKey,
      table.burnBlockHash,
    ),
    index('burn_blocks_consensus_hash_network_key_idx').on(
      table.consensusHash,
      table.networkKey,
    ),
  ],
);

export type BurnBlockDb = InferSelectModel<typeof burnBlocks>;

export const stateMachineUpdates = pgTable(
  'state_machine_updates',
  {
    id: serial('id').primaryKey(),
    signerPublicKey: varchar('signer_public_key', { length: 66 }).notNull(),
    networkKey: varchar('network_key', { length: 20 }).notNull(),
    localSignerProtocolVersion: integer(
      'local_signer_protocol_version',
    ).notNull(),
    activeSignerProtocolVersion: integer(
      'active_signer_protocol_version',
    ).notNull(),
    updateContent: json('update_content')
      .$type<SuperJSON<StateMachineUpdate['stateMachineUpdate']>>()
      .notNull(),
    chunkId: integer('chunk_id').references(() => stackerDbSlots.id),
    createdAt: timestamp('created_at').default(sql`now()`).notNull(),
  },
  (table) => [
    index('state_machine_updates_network_key_idx').on(table.networkKey),
    index('state_machine_updates_signer_public_key_idx').on(
      table.signerPublicKey,
    ),
    index('state_machine_updates_by_signer_latest_idx').on(
      table.signerPublicKey,
      table.createdAt.desc(),
      table.networkKey,
    ),
  ],
);

export type StateMachineUpdateDb = InferSelectModel<typeof stateMachineUpdates>;
