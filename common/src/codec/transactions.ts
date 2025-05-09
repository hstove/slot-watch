import * as P from 'micro-packed';
import {
  deserializeTransaction,
  serializeTransaction,
  type StacksTransactionWire,
} from '@stacks/transactions/dist/transaction';
import { BytesReader } from '@stacks/transactions/dist/BytesReader';

export function decodeTransactions(txsBytes: Uint8Array) {
  const txCount = P.U32BE.decode(txsBytes.slice(0, 4));
  const reader = new BytesReader(txsBytes.slice(4));
  const txs: StacksTransactionWire[] = [];
  for (let i = 0; i < txCount; i++) {
    const tx = deserializeTransaction(reader);
    txs.push(tx);
  }
  const extraBytes = txsBytes.slice(4 + reader.consumed);
  return { txs, extraBytes };
}
