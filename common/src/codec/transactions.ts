import * as P from 'micro-packed';
import { sha512_256 } from '@noble/hashes/sha2';
import type { ChunkEvent } from '../types';
import { secp256k1 } from '@noble/curves/secp256k1';
import type { StacksTransaction } from '@stacks/transactions';
import {
  deserializeTransaction,
  serializeTransaction,
} from '@stacks/transactions/dist/transaction';
import type { Prettify } from '../utils';
import { hex } from '@scure/base';

export const StacksTransactionCoder = P.struct({
  version: P.U8,
  chainId: P.U32BE,
  auth: P.mappedTag(P.U8, {
    standard: [4, P.struct({})],
    sponsored: [5, P.struct({})],
  }),
  rest: P.bytes(null),
});
