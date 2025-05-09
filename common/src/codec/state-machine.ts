import type { StacksTransactionWire } from '@stacks/transactions/dist/transaction';
import * as P from 'micro-packed';
import { decodeTransactions } from './transactions';

export const StateMachineUpdateOuterCoder = P.struct({
  activeSignerProtocolVersion: P.U64BE,
  localSignerProtocolVersion: P.U64BE,
  contentBytes: P.bytes(P.U32BE),
});

export interface StateMachineUpdateMinerStateActive {
  currentMinerPkh: Uint8Array;
  tenureId: Uint8Array;
  parentTenureId: Uint8Array;
  parentTenureLastBlock: Uint8Array;
  parentTenureLastBlockHeight: bigint;
  variant: 1;
}

export type StateMachineUpdateMinerStateInactive = {
  variant: 0;
};

export type StateMachineUpdateMinerState =
  | StateMachineUpdateMinerStateActive
  | StateMachineUpdateMinerStateInactive;

export const StateMachineUpdateMinerStateCoder = P.wrap({
  encodeStream: (w: P.Writer, data: StateMachineUpdateMinerState) => {
    P.U8.encodeStream(w, data.variant);
    if (data.variant === 1) {
      P.U32BE.encodeStream(w, 1);
      P.bytes(20).encodeStream(w, data.currentMinerPkh);
      P.bytes(20).encodeStream(w, data.tenureId);
      P.bytes(20).encodeStream(w, data.parentTenureId);
      P.bytes(32).encodeStream(w, data.parentTenureLastBlock);
      P.U64BE.encodeStream(w, data.parentTenureLastBlockHeight);
    } else {
      P.U32BE.encodeStream(w, 0);
    }
  },
  decodeStream: (r: P.Reader) => {
    const variant = P.U8.decodeStream(r);
    if (variant === 1) {
      return {
        variant: 1,
        currentMinerPkh: P.bytes(20).decodeStream(r),
        tenureId: P.bytes(20).decodeStream(r),
        parentTenureId: P.bytes(20).decodeStream(r),
        parentTenureLastBlock: P.bytes(32).decodeStream(r),
        parentTenureLastBlockHeight: P.U64BE.decodeStream(r),
      } satisfies StateMachineUpdateMinerStateActive;
    }
    if (variant === 0) {
      return {
        variant: 0,
      } satisfies StateMachineUpdateMinerStateInactive;
    }
    throw new Error('Invalid variant');
  },
});

export const StateMachineUpdateContentV0Coder = P.struct({
  burnBlock: P.bytes(20),
  burnBlockHeight: P.U64BE,
  minerState: StateMachineUpdateMinerStateCoder,
});

export const StateMachineUpdateContentV1Coder = P.struct({
  burnBlock: P.bytes(20),
  burnBlockHeight: P.U64BE,
  minerState: StateMachineUpdateMinerStateCoder,
  remainingBytes: P.bytes(null),
});

export const StateMachineUpdateContentUnknownCoder = P.struct({
  burnBlock: P.bytes(20),
  burnBlockHeight: P.U64BE,
  minerState: StateMachineUpdateMinerStateCoder,
  unknownBytes: P.bytes(null),
});

export type StateMachineUpdateContentV0 = P.UnwrapCoder<
  typeof StateMachineUpdateContentV0Coder
>;

export type StateMachineUpdateContentV1 = P.UnwrapCoder<
  typeof StateMachineUpdateContentV1Coder
> & {
  replayTxs: string[];
};

export type StateMachineUpdateContentUnknown = P.UnwrapCoder<
  typeof StateMachineUpdateContentUnknownCoder
>;

type StateMachine<V, C> = {
  activeSignerProtocolVersion: V;
  localSignerProtocolVersion: bigint;
  stateMachineUpdate: C;
};

type StateMachineUpdateV0 = StateMachine<0n, StateMachineUpdateContentV0>;
type StateMachineUpdateV1 = StateMachine<1n, StateMachineUpdateContentV1>;
type StateMachineUpdateUnknown = StateMachine<
  Exclude<bigint, 0n | 1n>,
  StateMachineUpdateContentUnknown
>;

export type StateMachineUpdate =
  | StateMachineUpdateV0
  | StateMachineUpdateV1
  | StateMachineUpdateUnknown;

export const StateMachineUpdateCoder = P.wrap({
  encodeStream: (w: P.Writer, data: StateMachineUpdate) => {
    P.U64BE.encodeStream(w, data.activeSignerProtocolVersion);
    P.U64BE.encodeStream(w, data.localSignerProtocolVersion);
    if (data.activeSignerProtocolVersion !== 0n) {
      throw new Error('Invalid version');
    }
    StateMachineUpdateContentV0Coder.encodeStream(w, data.stateMachineUpdate);
  },
  decodeStream: (r: P.Reader) => {
    const activeSignerProtocolVersion = P.U64BE.decodeStream(r);
    const localSignerProtocolVersion = P.U64BE.decodeStream(r);

    const byteLen = P.U32BE.decodeStream(r);
    if (activeSignerProtocolVersion === 0n) {
      const stateMachineUpdate =
        StateMachineUpdateContentV0Coder.decodeStream(r);
      return {
        activeSignerProtocolVersion,
        localSignerProtocolVersion,
        stateMachineUpdate,
      } satisfies StateMachineUpdateV0;
    }
    if (activeSignerProtocolVersion === 1n) {
      const stateMachineUpdate =
        StateMachineUpdateContentV1Coder.decodeStream(r);
      const { txs, extraBytes } = decodeTransactions(
        stateMachineUpdate.remainingBytes,
      );
      return {
        activeSignerProtocolVersion,
        localSignerProtocolVersion,
        stateMachineUpdate: {
          ...stateMachineUpdate,
          replayTxs: txs.map((tx) => tx.txid()),
          remainingBytes: extraBytes,
        },
      } satisfies StateMachineUpdateV1;
    }
    const stateMachineUpdate =
      StateMachineUpdateContentUnknownCoder.decodeStream(r);
    return {
      activeSignerProtocolVersion,
      localSignerProtocolVersion,
      stateMachineUpdate,
    } satisfies StateMachineUpdateUnknown;
  },
});
