import {
  pgTable,
  // serial,
  varchar as text,
  integer,
  // smallint,
  customType,
  timestamp,
  index,
  bigint,
  boolean,
  unique,
  numeric,
  primaryKey,
  check,
  json,
  real,
  // sqliteTable as pgTable,
  // text as,
} from 'drizzle-orm/pg-core';
import { sql, type InferSelectModel } from 'drizzle-orm';
import type { StateMachineUpdate, SuperJSON } from 'slot-watch-common';

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
  (_table) => []
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
    blockTimestamp: timestamp('block_timestamp').notNull(),
    txFees: bigint('tx_fees', { mode: 'number' }).default(0).notNull(),
    indexBlockHash: text('index_block_hash', { length: 64 })
      .default('')
      .notNull(),
  },
  (table) => [
    index('block_proposals_network_key_idx').on(table.networkKey),
    index('block_proposals_signer_signature_hash_idx').on(
      table.signerSignatureHash
    ),
    index('block_proposals_signer_signature_hash_network_key_idx').on(
      table.signerSignatureHash
    ),
    index('block_proposals_chain_length_idx').on(table.chainLength),
    index('block_proposals_burn_block_height_idx').on(
      table.burnBlockHeight,
      table.networkKey
    ),
    index('block_proposals_consensus_hash_network_key_idx').on(
      table.consensusHash,
      table.networkKey
    ),
    index('block_proposals_by_consensus_hash_idx').on(
      table.consensusHash,
      table.networkKey,
      table.chainLength,
      table.id
    ),
    index('block_proposals_index_block_hash_idx').on(table.indexBlockHash),
  ]
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
    accepted: boolean('accepted').notNull(),
    tenureExtendTimestamp: timestamp('tenure_extend_timestamp'),
    version: text('version'),
    rejectCode: integer('reject_code'),
    validationCode: integer('validation_code'),
    reason: text('reason'),
    rejectReason: integer('reject_reason'),
    latencyMs: integer('latency_ms'),
    blockHeight: integer('block_height'),
  },
  (table) => [
    index('block_responses_signer_signature_hash_idx').on(
      table.signerSignatureHash
    ),
  ]
);

export type BlockResponseDb = InferSelectModel<typeof blockResponses>;

export const blockPreCommits = pgTable(
  'block_pre_commits',
  {
    id: text().primaryKey(),
    signerSignatureHash: text('signer_signature_hash', {
      length: 64,
    }).notNull(),
    slotId: integer('slot_id').notNull(),
    networkKey: text('network_key', { length: 20 }).notNull(),
    chunkId: text('chunk_id'),
    signerPublicKey: text('signer_public_key', { length: 66 }).notNull(),
    latencyMs: integer('latency_ms'),
    blockHeight: integer('block_height'),
  },
  (table) => [
    index('block_pre_commits_network_key_idx').on(table.networkKey),
    index('block_pre_commits_signer_signature_hash_idx').on(
      table.signerSignatureHash
    ),
  ]
);

export type BlockPreCommitDb = InferSelectModel<typeof blockPreCommits>;

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
      table.signerSignatureHash
    ),
  ]
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
    blockTimestamp: timestamp('block_timestamp').notNull(),
    burnBlockTimestamp: timestamp('burn_block_timestamp').notNull(),
    indexBlockHash: text('index_block_hash', { length: 64 }).notNull(),
    txCount: integer('tx_count').notNull(),
    txFees: bigint('tx_fees', { mode: 'number' }).default(0).notNull(),
    readCount: bigint('read_count', { mode: 'number' }).notNull(),
    readLength: bigint('read_length', { mode: 'number' }).notNull(),
    runtime: bigint('runtime', { mode: 'number' }).notNull(),
    writeCount: bigint('write_count', { mode: 'number' }).notNull(),
    writeLength: bigint('write_length', { mode: 'number' }).notNull(),
    consensusHash: text('consensus_hash', { length: 64 }).notNull(),
  },
  (table) => [
    index('stacks_blocks_block_height_idx').on(table.blockHeight),
    index('stacks_blocks_block_hash_idx').on(table.blockHash),
    index('stacks_blocks_index_block_hash_idx').on(table.indexBlockHash),
    unique('stacks_blocks_network_key_block_hash_idx').on(
      table.networkKey,
      table.blockHash
    ),
    index('stacks_blocks_consensus_hash_network_key_idx').on(
      table.consensusHash,
      table.networkKey
    ),
    index('stacks_blocks_index_block_hash_network_key_idx').on(
      table.networkKey,
      table.indexBlockHash
    ),
  ]
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
    poxSpendSats: bigint('pox_spend_sats', { mode: 'number' })
      .default(0)
      .notNull(),
    /** Satoshis sent to the burn address by miners. Total miner BTC spend for
     * the block is poxSpendSats + burnAmountSats. */
    burnAmountSats: bigint('burn_amount_sats', { mode: 'number' })
      .default(0)
      .notNull(),
    /** Bitcoin txid of the block commit that won this block's sortition, set
     * when the tenure's first Stacks block arrives. Joins to
     * `miner_spends.txid`. Null if no sortition or not yet resolved. */
    winningTxid: text('winning_txid', { length: 64 }),
  },
  (table) => [
    index('burn_blocks_network_key_idx').on(table.networkKey),
    index('burn_blocks_burn_block_height_idx').on(table.burnBlockHeight),
    unique('burn_blocks_network_key_burn_block_hash_idx').on(
      table.networkKey,
      table.burnBlockHash
    ),
    index('burn_blocks_consensus_hash_network_key_idx').on(
      table.consensusHash,
      table.networkKey
    ),
  ]
);

export type BurnBlockDb = InferSelectModel<typeof burnBlocks>;

/**
 * One-hour market candle opens. `hourStart` is the UTC candle bucket, not
 * the fetch time. `openPrice` is quote currency per one base currency in
 * `productId` (initially BTC-USD and STX-USD). Cross rates are derived from
 * prices for the same source and hour, rather than stored separately.
 */
export const hourlyPrices = pgTable(
  'hourly_prices',
  {
    source: text('source', { length: 32 }).notNull(),
    productId: text('product_id', { length: 20 }).notNull(),
    hourStart: timestamp('hour_start', { withTimezone: true }).notNull(),
    openPrice: numeric('open_price', { precision: 24, scale: 10 }).notNull(),
    fetchedAt: timestamp('fetched_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    primaryKey({
      name: 'hourly_prices_source_product_hour_pk',
      columns: [table.source, table.productId, table.hourStart],
    }),
    check('hourly_prices_open_positive', sql`${table.openPrice} > 0`),
    check(
      'hourly_prices_hour_aligned',
      sql`extract(epoch from ${table.hourStart}) % 3600 = 0`
    ),
  ]
);

export type HourlyPriceDb = InferSelectModel<typeof hourlyPrices>;

/**
 * One row per block-commit transaction in a burn block, from
 * `pox_transactions` in `/new_burn_block`. The miner is identified by the
 * commit's input public key (fetched from a Bitcoin API), which is the same
 * key that signs the miner's block proposals. `minerAddress` is the STX
 * address derived from that key and equals `miner_rewards.miner_address`, so
 * spend and revenue join on it. A commit won its sortition when
 * `stacks_blocks.miner_txid = txid`; its tenure is `consensusHash`, which
 * equals `miner_rewards.earned_consensus_hash`.
 */
export const minerSpends = pgTable(
  'miner_spends',
  {
    id: text().primaryKey(),
    networkKey: text('network_key', { length: 20 }).notNull(),
    burnBlockHeight: integer('burn_block_height').notNull(),
    burnBlockHash: text('burn_block_hash', { length: 64 }).notNull(),
    /** Consensus hash of the burn block the commit was mined in. */
    consensusHash: text('consensus_hash', { length: 64 }).notNull(),
    txid: text('txid', { length: 64 }).notNull(),
    /** Satoshis paid to PoX reward recipients by this commit. */
    spendSats: bigint('spend_sats', { mode: 'number' }).notNull(),
    /** Satoshis this commit sent to the burn address. The node's event only
     * reports burns in aggregate, so ingest leaves this 0; the backfill's gap
     * phase fills it from Bitcoin data. Total spend is spendSats + burnSats. */
    burnSats: bigint('burn_sats', { mode: 'number' }).default(0).notNull(),
    recipientCount: integer('recipient_count').notNull(),
    /** Compressed secp256k1 key from the commit's first input. Null if unresolved. */
    minerPublicKey: text('miner_public_key', { length: 66 }),
    /** STX address derived from `minerPublicKey`. */
    minerAddress: text('miner_address'),
    /** Bitcoin address the commit's first input spent from (p2pkh or p2wpkh). */
    minerBtcAddress: text('miner_btc_address'),
    /** Index of the commit tx within its Bitcoin block. 0 if unresolved. */
    vtxindex: integer('vtxindex').default(0).notNull(),
  },
  (table) => [
    unique('miner_spends_network_key_txid_idx').on(
      table.networkKey,
      table.txid
    ),
    index('miner_spends_burn_block_height_network_key_idx').on(
      table.networkKey,
      table.burnBlockHeight
    ),
    index('miner_spends_miner_address_network_key_idx').on(
      table.minerAddress,
      table.networkKey
    ),
    index('miner_spends_consensus_hash_network_key_idx').on(
      table.consensusHash,
      table.networkKey
    ),
  ]
);

export type MinerSpendDb = InferSelectModel<typeof minerSpends>;

/**
 * Matured miner rewards from `/new_block` events. One row per (maturing block,
 * recipient). `coinbaseUstx` already includes coinbases accumulated from
 * missed sortitions. Revenue is attributed to the tenure that earned it via
 * `earnedConsensusHash`/`earnedBurnBlockHeight` (resolved by joining
 * `fromIndexBlockHash` to `stacks_blocks.index_block_hash` at ingest); join
 * `earnedConsensusHash` to `block_proposals.consensus_hash` for the miner's
 * public key.
 */
export const minerRewards = pgTable(
  'miner_rewards',
  {
    id: text().primaryKey(),
    networkKey: text('network_key', { length: 20 }).notNull(),
    /** STX principal receiving the reward (may be a contract). */
    recipient: text('recipient').notNull(),
    /** The winning miner's STX address. */
    minerAddress: text('miner_address'),
    coinbaseUstx: bigint('coinbase_ustx', { mode: 'number' }).notNull(),
    txFeesAnchoredUstx: bigint('tx_fees_anchored_ustx', {
      mode: 'number',
    }).notNull(),
    txFeesStreamedConfirmedUstx: bigint('tx_fees_streamed_confirmed_ustx', {
      mode: 'number',
    }).notNull(),
    txFeesStreamedProducedUstx: bigint('tx_fees_streamed_produced_ustx', {
      mode: 'number',
    }).notNull(),
    fromStacksBlockHash: text('from_stacks_block_hash', {
      length: 64,
    }).notNull(),
    /** Index block hash of the block that earned the reward. */
    fromIndexBlockHash: text('from_index_block_hash', { length: 64 }).notNull(),
    /** Stacks block height of the block whose event delivered (matured) the reward. */
    maturedBlockHeight: integer('matured_block_height').notNull(),
    maturedBurnBlockHeight: integer('matured_burn_block_height').notNull(),
    /** Tenure that earned the reward. Null if the earning block wasn't indexed. */
    earnedConsensusHash: text('earned_consensus_hash', { length: 64 }),
    earnedBurnBlockHeight: integer('earned_burn_block_height'),
  },
  (table) => [
    unique('miner_rewards_network_from_index_recipient_idx').on(
      table.networkKey,
      table.fromIndexBlockHash,
      table.recipient
    ),
    index('miner_rewards_earned_burn_block_height_network_key_idx').on(
      table.networkKey,
      table.earnedBurnBlockHeight
    ),
    index('miner_rewards_miner_address_network_key_idx').on(
      table.minerAddress,
      table.networkKey
    ),
  ]
);

export type MinerRewardDb = InferSelectModel<typeof minerRewards>;

export const MINER_COMMIT_STATUSES = [
  'pending',
  'confirmed',
  'replaced',
  'dropped',
] as const;
export type MinerCommitStatus = (typeof MINER_COMMIT_STATUSES)[number];

/** `ws`: our mempool.space WebSocket saw it; `mempool_space`: mempool.space's own first-seen time (seconds). */
export const FIRST_SEEN_SOURCES = ['ws', 'mempool_space', 'logger'] as const;
export type FirstSeenSource = (typeof FIRST_SEEN_SOURCES)[number];

/**
 * One row per block-commit tx version seen in the mempool or confirmed,
 * including RBF-replaced versions. Written by the `MinerCommitsWatcher`
 * Durable Object. Versions that spend the same first input (`chainInput`) form
 * one replacement chain; confirmed rows join `miner_spends` by `txid`.
 */
export const minerCommitTxs = pgTable(
  'miner_commit_txs',
  {
    /** uuidv7 from `firstSeenAt` (or insert time when unknown). */
    id: text().primaryKey(),
    networkKey: text('network_key', { length: 20 }).notNull(),
    txid: text('txid', { length: 64 }).notNull(),
    /** `txid:vout` of the first input; RBF versions share it. */
    chainInput: text('chain_input', { length: 80 }).notNull(),
    replacesTxid: text('replaces_txid', { length: 64 }),
    replacedByTxid: text('replaced_by_txid', { length: 64 }),
    /** 0-based position in the replacement chain. */
    chainPosition: integer('chain_position').default(0).notNull(),
    minerBtcAddress: text('miner_btc_address').notNull(),
    minerPublicKey: text('miner_public_key', { length: 66 }),
    minerAddress: text('miner_address'),
    bidSats: bigint('bid_sats', { mode: 'number' }).notNull(),
    feeSats: bigint('fee_sats', { mode: 'number' }).notNull(),
    vsize: real('vsize').notNull(),
    feeRate: real('fee_rate').notNull(),
    parentHeight: integer('parent_height').notNull(),
    parentVtx: integer('parent_vtx').notNull(),
    burnModulus: integer('burn_modulus').notNull(),
    firstSeenAt: timestamp('first_seen_at', {
      withTimezone: true,
      precision: 3,
    }),
    firstSeenSource: text('first_seen_source', {
      length: 16,
      enum: FIRST_SEEN_SOURCES,
    }),
    status: text('status', { length: 16, enum: MINER_COMMIT_STATUSES })
      .default('pending')
      .notNull(),
    /** When it was replaced, dropped or confirmed, where known. */
    leftMempoolAt: timestamp('left_mempool_at', {
      withTimezone: true,
      precision: 3,
    }),
    confirmedHeight: integer('confirmed_height'),
    fullRbf: boolean('full_rbf'),
    /** Set once the chain was checked against mempool.space's RBF tree. */
    reconciledAt: timestamp('reconciled_at', { withTimezone: true }),
  },
  (table) => [
    unique('miner_commit_txs_network_key_txid_idx').on(
      table.networkKey,
      table.txid
    ),
    index('miner_commit_txs_network_key_chain_input_idx').on(
      table.networkKey,
      table.chainInput
    ),
    index('miner_commit_txs_network_key_confirmed_height_idx').on(
      table.networkKey,
      table.confirmedHeight
    ),
    index('miner_commit_txs_network_key_miner_address_id_idx').on(
      table.networkKey,
      table.minerAddress,
      table.id
    ),
  ]
);

export type MinerCommitTxDb = InferSelectModel<typeof minerCommitTxs>;

/**
 * Per Bitcoin block data from outside the Stacks event stream: mempool.space
 * block stats and the node's sortition outcome. Separate from `burn_blocks` so
 * that table stays purely event-sourced.
 */
export const bitcoinBlocks = pgTable(
  'bitcoin_blocks',
  {
    networkKey: text('network_key', { length: 20 }).notNull(),
    burnBlockHash: text('burn_block_hash', { length: 64 }).notNull(),
    burnBlockHeight: integer('burn_block_height').notNull(),
    headerTimestamp: timestamp('header_timestamp', { withTimezone: true }),
    /** When the watcher's WebSocket announced the block. Null if backfilled. */
    observedAt: timestamp('observed_at', { withTimezone: true, precision: 3 }),
    /** False when the null miner won or no commit was valid. */
    wasSortition: boolean('was_sortition'),
    /** Hash160 of the sortition winner's key, even if it never produced a block. */
    sortitionMinerPkHash160: text('sortition_miner_pk_hash160', {
      length: 40,
    }),
    medianFeeRate: real('median_fee_rate'),
    /** [min, p10, p25, p50, p75, p90, max] sat/vB. */
    feeRange: real('fee_range').array(),
    totalFeesSats: bigint('total_fees_sats', { mode: 'number' }),
    txCount: integer('tx_count'),
    weight: integer('weight'),
    poolName: text('pool_name'),
    fetchedAt: timestamp('fetched_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    primaryKey({
      name: 'bitcoin_blocks_network_key_hash_pk',
      columns: [table.networkKey, table.burnBlockHash],
    }),
    index('bitcoin_blocks_network_key_height_idx').on(
      table.networkKey,
      table.burnBlockHeight
    ),
  ]
);

export type BitcoinBlockDb = InferSelectModel<typeof bitcoinBlocks>;

/**
 * Compact projected-mempool fee snapshots: the next projected block's median
 * and fee range, plus the second block's minimum. Taken every 30s and at
 * each new block (the ladder the block was mined against).
 */
export const mempoolFeeSnapshots = pgTable(
  'mempool_fee_snapshots',
  {
    networkKey: text('network_key', { length: 20 }).notNull(),
    observedAt: timestamp('observed_at', {
      withTimezone: true,
      precision: 3,
    }).notNull(),
    tipHeight: integer('tip_height').notNull(),
    nextMedianFeeRate: real('next_median_fee_rate').notNull(),
    /** [min, p10, p25, p50, p75, p90, max] sat/vB. */
    nextFeeRange: real('next_fee_range').array().notNull(),
    /** Under ~900k vB the next block takes everything, so its min isn't a threshold. */
    nextBlockVsize: integer('next_block_vsize').notNull(),
    secondMinFeeRate: real('second_min_fee_rate'),
  },
  (table) => [
    primaryKey({
      name: 'mempool_fee_snapshots_network_key_observed_at_pk',
      columns: [table.networkKey, table.observedAt],
    }),
  ]
);

export type MempoolFeeSnapshotDb = InferSelectModel<typeof mempoolFeeSnapshots>;

export const stateMachineUpdates = pgTable(
  'state_machine_updates',
  {
    id: text().primaryKey(),
    signerPublicKey: text('signer_public_key', { length: 66 }).notNull(),
    networkKey: text('network_key', { length: 20 }).notNull(),
    localSignerProtocolVersion: integer(
      'local_signer_protocol_version'
    ).notNull(),
    activeSignerProtocolVersion: integer(
      'active_signer_protocol_version'
    ).notNull(),
    updateContent: json('update_content')
      .$type<SuperJSON<StateMachineUpdate['stateMachineUpdate']>>()
      .notNull(),
    chunkId: text('chunk_id'),
  },
  (_table) => []
);

export type StateMachineUpdateDb = InferSelectModel<typeof stateMachineUpdates>;
