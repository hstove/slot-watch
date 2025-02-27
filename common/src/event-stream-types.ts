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
    hex.encode(new Uint8Array(payload.contract_id.issuer[1])),
  );
  return `${addressToString(address)}.${payload.contract_id.name}`;
}

export const string0x = z
  .string()
  .transform((s) => (s.startsWith('0x') ? s.slice(2) : s));

export type ModifiedSlot = {
  slot_id: number;
  slot_version: number;
  data: string;
  sig: string;
};

export type StackerDBPayload = {
  contract_id: {
    issuer: [number, Uint8Array];
    name: string;
  };
  modified_slots: ModifiedSlot[];
};

interface _CoreNodeBlockMessage {
  block_hash: string;
  block_height: number;
  burn_block_time: number;
  burn_block_hash: string;
  burn_block_height: number;
  miner_txid: string;
  index_block_hash: string;
  parent_index_block_hash: string;
  parent_block_hash: string;
  parent_microblock: string;
  parent_microblock_sequence: number;
  parent_burn_block_hash: string;
  parent_burn_block_height: number;
  parent_burn_block_timestamp: number;
  events: unknown[];
  transactions: unknown[];
  matured_miner_rewards: {
    from_index_consensus_hash: string;
    from_stacks_block_hash: string;
    /** STX principal */
    recipient: string;
    /** STX principal (available starting in Stacks 2.1) */
    miner_address: string | null;
    /** String quoted micro-STX amount. */
    coinbase_amount: string;
    /** String quoted micro-STX amount. */
    tx_fees_anchored: string;
    /** String quoted micro-STX amount. */
    tx_fees_streamed_confirmed: string;
    /** String quoted micro-STX amount. */
    tx_fees_streamed_produced: string;
  }[];
  pox_v1_unlock_height?: number;
  pox_v2_unlock_height?: number;
  pox_v3_unlock_height?: number;
  /** Available starting in epoch3, only included in blocks where the pox cycle rewards are first calculated */
  cycle_number?: number;
  /** Available starting in epoch3, only included in blocks where the pox cycle rewards are first calculated */
  reward_set?: {
    pox_ustx_threshold: string; // "666720000000000"
    rewarded_addresses: string[]; // burnchain (btc) addresses
    signers?: {
      signing_key: string; // "03a80704b1eb07b4d526f069d6ac592bb9b8216bcf1734fa40badd8f9867b4c79e",
      weight: number; // 1,
      stacked_amt: string; // "3000225000000000"
    }[];
    start_cycle_state: {
      missed_reward_slots: [];
    };
  };
  block_time: number;
  signer_bitvec?: string | null;
}

export const coreNodeBlockMessageSchema = z.object({
  block_hash: string0x,
  block_height: z.number(),
  burn_block_time: z.number(),
  burn_block_hash: string0x,
  burn_block_height: z.number(),
  miner_txid: z.string(),
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
    }),
  ),
});

export type CoreNodeBlockMessage = z.infer<typeof coreNodeBlockMessageSchema>;

interface _CoreNodeBurnBlockMessage {
  burn_block_hash: string;
  burn_block_height: number;
  /** Amount in BTC satoshis. */
  burn_amount: number;
  reward_recipients: [
    {
      /** Bitcoin address (b58 encoded). */
      recipient: string;
      /** Amount in BTC satoshis. */
      amt: number;
    },
  ];
  /**
   * Array of the Bitcoin addresses that would validly receive PoX commitments during this block.
   * These addresses may not actually receive rewards during this block if the block is faster
   * than miners have an opportunity to commit.
   */
  reward_slot_holders: string[];
}

export const coreNodeBurnBlockMessageSchema = z.object({
  burn_block_hash: string0x,
  burn_block_height: z.number(),
  burn_amount: z.number(),
  reward_recipients: z.array(
    z.object({
      recipient: z.string(),
      amt: z.number(),
    }),
  ),
  reward_slot_holders: z.array(z.string()),
  consensus_hash: string0x,
});

export type CoreNodeBurnBlockMessage = z.infer<
  typeof coreNodeBurnBlockMessageSchema
>;
