import { test, expect } from 'vitest';
import {
  coreNodeBurnBlockMessageSchema,
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
