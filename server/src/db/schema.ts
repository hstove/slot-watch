import {
  // pgTable,
  // serial,
  // varchar,
  integer,
  // smallint,
  customType,
  // timestamp,
  index,
  // bigint,
  // boolean,
  unique,
  // json,
  sqliteTable as pgTable,
  text,
} from 'drizzle-orm/sqlite-core';
import { eq, isNotNull, sql, type InferSelectModel } from 'drizzle-orm';
import type { StateMachineUpdate, SuperJSON } from 'slot-watch-common';
import { v7 as uuidv7 } from 'uuid';

const bytea = customType<{ data: Uint8Array; notNull: false; default: false }>({
  dataType() {
    return 'bytea';
  },
});

export const stackerDbSlots = pgTable(
  'stacker_db_slots',
  {
    id: text()
      // .$defaultFn(() => uuidv7())
      .primaryKey(),
    slotId: integer('slot_id').notNull(),
    version: integer('version').notNull(),
    signature: bytea('signature').notNull(),
    data: bytea('data').notNull(),
    contractId: text('contract_id', { length: 255 }).notNull(),
    // createdAt: timestamp('created_at').default(sql`now()`).notNull(),
    networkKey: text('network_key', { length: 20 }).notNull(),
    publicKey: text('public_key', { length: 66 }).notNull(),
  },
  (table) => [
    index('network_key_idx').on(table.networkKey),
    index('public_key_idx').on(table.publicKey),
    index('stackerdb_slots_created_at_network_key_idx').on(
      table.id,
      table.networkKey,
    ),
  ],
);

export type StackerDbSlotDb = InferSelectModel<typeof stackerDbSlots>;

export const blockProposals = pgTable(
  'block_proposals',
  {
    id: text()
      // .$defaultFn(() => uuidv7())
      .primaryKey(),
    signerSignatureHash: text('signer_signature_hash', {
      length: 64,
    }).notNull(),
    chainLength: integer('chain_length').notNull(),
    // createdAt: timestamp('created_at').default(sql`now()`).notNull(),
    networkKey: text('network_key', { length: 20 }).notNull(),
    chunkId: text('chunk_id'),
    minerPublicKey: text('miner_public_key', { length: 66 }).notNull(),
    consensusHash: text('consensus_hash', { length: 64 }).notNull(),
    tenureChangeCause: integer('tenure_change_cause'),
    txCount: integer('tx_count').notNull(),
    burnBlockHeight: integer('burn_block_height').notNull(),
    serverVersion: text('server_version'),
    blockTimestamp: integer('block_timestamp', {
      mode: 'timestamp_ms',
    }).notNull(),
    txFees: integer('tx_fees', { mode: 'number' }).default(0).notNull(),
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
    index('block_proposals_by_consensus_hash_idx').on(
      table.consensusHash,
      table.networkKey,
      table.chainLength,
      table.id,
    ),
  ],
);

export type BlockProposalDb = InferSelectModel<typeof blockProposals>;

export const blockResponses = pgTable(
  'block_responses',
  {
    id: text()
      // .$defaultFn(() => uuidv7())
      .primaryKey(),
    signerSignatureHash: text('signer_signature_hash', {
      length: 64,
    }).notNull(),
    slotId: integer('slot_id').notNull(),
    // createdAt: timestamp('created_at').default(sql`now()`).notNull(),
    networkKey: text('network_key', { length: 20 }).notNull(),
    chunkId: text('chunk_id'),
    signerPublicKey: text('signer_public_key', { length: 66 }).notNull(),
    accepted: integer('accepted', { mode: 'boolean' }).notNull(),
    tenureExtendTimestamp: integer('tenure_extend_timestamp', {
      mode: 'timestamp_ms',
    }),
    version: text('version'),
    rejectCode: integer('reject_code'),
    validationCode: integer('validation_code'),
    reason: text('reason'),
    rejectReason: integer('reject_reason'),
    latencyMs: integer('latency_ms'),
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
      table.id,
    ),
  ],
);

export type BlockResponseDb = InferSelectModel<typeof blockResponses>;

export const blockPushes = pgTable(
  'block_pushes',
  {
    id: text()
      // .$defaultFn(() => uuidv7())
      .primaryKey(),
    signerSignatureHash: text('signer_signature_hash', {
      length: 64,
    }).notNull(),
    chainLength: integer('chain_length').notNull(),
    // createdAt: timestamp('created_at').default(sql`now()`).notNull(),
    networkKey: text('network_key', { length: 20 }).notNull(),
    chunkId: text('chunk_id'),
    minerPublicKey: text('miner_public_key', { length: 66 }).notNull(),
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
    id: text()
      // .$defaultFn(() => uuidv7())
      .primaryKey(),
    blockHeight: integer('block_height').notNull(),
    blockHash: text('block_hash', { length: 64 }).notNull(),
    burnBlockHeight: integer('burn_block_height').notNull(),
    burnBlockHash: text('burn_block_hash', { length: 64 }).notNull(),
    // createdAt: timestamp('created_at').default(sql`now()`).notNull(),
    networkKey: text('network_key', { length: 20 }).notNull(),
    tenureChangeCause: integer('tenure_change_cause'),
    blockTimestamp: integer('block_timestamp', {
      mode: 'timestamp_ms',
    }).notNull(),
    burnBlockTimestamp: integer('burn_block_timestamp', {
      mode: 'timestamp_ms',
    }).notNull(),
    indexBlockHash: text('index_block_hash', { length: 64 }).notNull(),
    txCount: integer('tx_count').notNull(),
    txFees: integer('tx_fees', { mode: 'number' }).default(0).notNull(),
    readCount: integer('read_count', { mode: 'number' }).notNull(),
    readLength: integer('read_length', { mode: 'number' }).notNull(),
    runtime: integer('runtime', { mode: 'number' }).notNull(),
    writeCount: integer('write_count', { mode: 'number' }).notNull(),
    writeLength: integer('write_length', { mode: 'number' }).notNull(),
    consensusHash: text('consensus_hash', { length: 64 }).notNull(),
  },
  (table) => [
    index('stacks_blocks_network_key_idx').on(table.networkKey),
    index('stacks_blocks_block_height_idx').on(table.blockHeight),
    // index('stacks_blocks_created_at_idx').on(table.createdAt),
    index('stacks_blocks_block_hash_idx').on(table.blockHash),
    index('stacks_blocks_burn_block_hash_idx').on(table.burnBlockHash),
    unique('stacks_blocks_network_key_block_hash_idx').on(
      table.networkKey,
      table.blockHash,
    ),
    index('stacks_blocks_tenure_change_recent_idx')
      .on(table.tenureChangeCause, table.id, table.networkKey)
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
    id: text()
      // .$defaultFn(() => uuidv7())
      .primaryKey(),
    burnBlockHeight: integer('burn_block_height').notNull(),
    burnBlockHash: text('burn_block_hash', { length: 64 }).notNull(),
    // createdAt: timestamp('created_at').default(sql`now()`).notNull(),
    networkKey: text('network_key', { length: 20 }).notNull(),
    consensusHash: text('consensus_hash', { length: 64 }).notNull(),
  },
  (table) => [
    index('burn_blocks_network_key_idx').on(table.networkKey),
    index('burn_blocks_burn_block_height_idx').on(table.burnBlockHeight),
    // index('burn_blocks_created_at_idx').on(table.createdAt),
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
    id: text()
      // .$defaultFn(() => uuidv7())
      .primaryKey(),
    signerPublicKey: text('signer_public_key', { length: 66 }).notNull(),
    networkKey: text('network_key', { length: 20 }).notNull(),
    localSignerProtocolVersion: integer(
      'local_signer_protocol_version',
    ).notNull(),
    activeSignerProtocolVersion: integer(
      'active_signer_protocol_version',
    ).notNull(),
    updateContent: text('update_content', { mode: 'json' })
      .$type<SuperJSON<StateMachineUpdate['stateMachineUpdate']>>()
      .notNull(),
    chunkId: text('chunk_id'),
    // createdAt: timestamp('created_at').default(sql`now()`).notNull(),
  },
  (table) => [
    index('state_machine_updates_network_key_idx').on(table.networkKey),
    index('state_machine_updates_signer_public_key_idx').on(
      table.signerPublicKey,
    ),
    index('state_machine_updates_by_signer_latest_idx').on(
      table.signerPublicKey,
      // table.createdAt.desc(),
      table.networkKey,
    ),
  ],
);

export type StateMachineUpdateDb = InferSelectModel<typeof stateMachineUpdates>;
