import {
  AddressVersion,
  addressFromVersionHash,
  addressToString,
} from '@stacks/transactions';
import { hex } from '@scure/base';
import { z } from 'zod';

export function getPayloadContractId(payload: StackerDBPayload) {
  const version =
    payload.contract_id.issuer[0] === 26
      ? AddressVersion.TestnetSingleSig
      : AddressVersion.MainnetSingleSig;
  const address = addressFromVersionHash(
    version,
    hex.encode(new Uint8Array(payload.contract_id.issuer[1]))
  );
  return `${addressToString(address)}.${payload.contract_id.name}`;
}

export const string0x = z
  .string()
  .transform((s) => (s.startsWith('0x') ? s.slice(2) : s));

// biome-ignore lint/style/useConsistentTypeDefinitions: ignored using `--suppress`
export type ModifiedSlot = {
  slot_id: number;
  slot_version: number;
  data: string;
  sig: string;
};

// biome-ignore lint/style/useConsistentTypeDefinitions: ignored using `--suppress`
export type StackerDBPayload = {
  contract_id: {
    issuer: [number, Uint8Array];
    name: string;
  };
  modified_slots: ModifiedSlot[];
};

/**
 * A matured miner reward from the `/new_block` payload. Rewards mature ~100
 * tenures after the tenure that earned them; `coinbase_amount` is the full
 * realized coinbase, including coinbases accumulated from missed sortitions.
 * All amounts are decimal-string micro-STX.
 */
export const maturedMinerRewardSchema = z.object({
  /**
   * Despite the name, this is the index block hash (StacksBlockId) of the
   * block that earned the reward — joinable to `stacks_blocks.index_block_hash`.
   */
  from_index_consensus_hash: string0x,
  from_stacks_block_hash: string0x,
  /** STX principal receiving the reward (may differ from miner_address). */
  recipient: z.string(),
  /** The winning miner's STX address (available starting in Stacks 2.1). */
  miner_address: z.string().nullable(),
  coinbase_amount: z.string(),
  tx_fees_anchored: z.string(),
  tx_fees_streamed_confirmed: z.string(),
  tx_fees_streamed_produced: z.string(),
});

export type MaturedMinerReward = z.infer<typeof maturedMinerRewardSchema>;

export const coreNodeBlockMessageSchema = z.object({
  block_hash: string0x,
  block_height: z.number(),
  burn_block_time: z.number(),
  burn_block_hash: string0x,
  burn_block_height: z.number(),
  miner_txid: string0x,
  index_block_hash: string0x,
  parent_index_block_hash: z.string(),
  parent_block_hash: z.string(),
  parent_microblock: z.string(),
  parent_microblock_sequence: z.number(),
  parent_burn_block_hash: z.string(),
  parent_burn_block_height: z.number(),
  parent_burn_block_timestamp: z.number(),
  block_time: z.number().nullable(),
  signer_bitvec: z.string().nullable(),
  cycle_number: z.number().nullable(),
  consensus_hash: string0x,
  tenure_height: z.number().nullish(),
  /** Empty when no rewards matured at this block. */
  matured_miner_rewards: z.array(maturedMinerRewardSchema).default([]),
  transactions: z.array(
    z.object({
      txid: string0x,
      raw_tx: string0x,
      execution_cost: z.object({
        read_count: z.number(),
        read_length: z.number(),
        runtime: z.number(),
        write_count: z.number(),
        write_length: z.number(),
      }),
    })
  ),
});

export type CoreNodeBlockMessage = z.infer<typeof coreNodeBlockMessageSchema>;

const poxTransactionRewardSchema = z.object({
  txid: z.string(),
  reward_recipients: z.array(
    z.object({
      recipient: z.string(),
      amt: z.number(),
      utxo_idx: z.number(),
    })
  ),
});

/** Matches `BurnBlockEvent` in stacks-core (`stackslib/src/chainstate/stacks/events.rs`). */
export const coreNodeBurnBlockMessageSchema = z.object({
  burn_block_hash: string0x,
  burn_block_height: z.number(),
  /** Satoshis sent to the burn address by miners in this block. */
  burn_amount: z.number(),
  /** Aggregate PoX payouts: b58-encoded Bitcoin address and satoshis. */
  reward_recipients: z.array(
    z.object({
      recipient: z.string(),
      amt: z.number(),
    })
  ),
  /**
   * Bitcoin addresses (b58) that would validly receive PoX commitments during
   * this block. These addresses may not actually receive rewards if the block
   * is faster than miners have an opportunity to commit.
   */
  reward_slot_holders: z.array(z.string()),
  consensus_hash: string0x,
  /** Absent on older node payloads. */
  parent_burn_block_hash: string0x.optional(),
  /** Per-commit PoX payouts. Absent on older node payloads. */
  pox_transactions: z.array(poxTransactionRewardSchema).default([]),
});

export type CoreNodeBurnBlockMessage = z.infer<
  typeof coreNodeBurnBlockMessageSchema
>;

/** Total micro-STX earned in a matured miner reward (coinbase + all fee shares). */
export function sumMinerRewardUstx(reward: MaturedMinerReward): number {
  return (
    Number(reward.coinbase_amount) +
    Number(reward.tx_fees_anchored) +
    Number(reward.tx_fees_streamed_confirmed) +
    Number(reward.tx_fees_streamed_produced)
  );
}

/** Total miner PoX spend for a burn block, in satoshis. */
export function sumPoxSpendSats(
  poxTransactions: CoreNodeBurnBlockMessage['pox_transactions']
): number {
  let total = 0;
  for (const tx of poxTransactions) {
    for (const recipient of tx.reward_recipients) {
      total += recipient.amt;
    }
  }
  return total;
}
