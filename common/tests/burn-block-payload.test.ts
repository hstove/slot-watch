import { test, expect } from 'vitest';
import {
  coreNodeBurnBlockMessageSchema,
  maturedMinerRewardSchema,
  sumMinerRewardUstx,
  sumPoxSpendSats,
} from '../src/event-stream-types';

const burnHash = `0x${'aa'.repeat(32)}`;
const consensusHash = `0x${'bb'.repeat(20)}`;
const txidA = `0x${'11'.repeat(32)}`;
const txidB = `0x${'22'.repeat(32)}`;

const baseBurnBlock = {
  burn_block_hash: burnHash,
  burn_block_height: 800_000,
  burn_amount: 0,
  reward_recipients: [{ recipient: 'bc1qexample', amt: 30_000 }],
  reward_slot_holders: ['bc1qexample'],
  consensus_hash: consensusHash,
};

test('sums pox_transactions recipient amounts in satoshis', () => {
  const parsed = coreNodeBurnBlockMessageSchema.parse({
    ...baseBurnBlock,
    pox_transactions: [
      {
        txid: txidA,
        reward_recipients: [
          { recipient: 'bc1qa', amt: 10_000, utxo_idx: 0 },
          { recipient: 'bc1qb', amt: 10_000, utxo_idx: 1 },
        ],
      },
      {
        txid: txidB,
        reward_recipients: [{ recipient: 'bc1qc', amt: 5000, utxo_idx: 0 }],
      },
    ],
  });

  expect(sumPoxSpendSats(parsed.pox_transactions)).toEqual(25_000);
});

test('treats missing pox_transactions as zero spend', () => {
  const parsed = coreNodeBurnBlockMessageSchema.parse(baseBurnBlock);
  expect(parsed.pox_transactions).toEqual([]);
  expect(sumPoxSpendSats(parsed.pox_transactions)).toEqual(0);
});

test('parses burn_amount and optional parent_burn_block_hash', () => {
  const parsed = coreNodeBurnBlockMessageSchema.parse({
    ...baseBurnBlock,
    burn_amount: 12_345,
    parent_burn_block_hash: `0x${'cc'.repeat(32)}`,
  });
  expect(parsed.burn_amount).toEqual(12_345);
  expect(parsed.parent_burn_block_hash).toEqual('cc'.repeat(32));
  expect(
    coreNodeBurnBlockMessageSchema.parse(baseBurnBlock).parent_burn_block_hash
  ).toBeUndefined();
});

test('sums matured miner reward amounts in micro-STX', () => {
  const reward = maturedMinerRewardSchema.parse({
    from_index_consensus_hash: `0x${'dd'.repeat(32)}`,
    from_stacks_block_hash: `0x${'ee'.repeat(32)}`,
    recipient: 'SP000000000000000000002Q6VF78',
    miner_address: 'SP000000000000000000002Q6VF78',
    // 2x coinbase, e.g. after one missed sortition
    coinbase_amount: '2000000000',
    tx_fees_anchored: '150000',
    tx_fees_streamed_confirmed: '25000',
    tx_fees_streamed_produced: '10000',
  });
  expect(sumMinerRewardUstx(reward)).toEqual(2_000_185_000);
});
