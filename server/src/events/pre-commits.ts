import { hex } from '@scure/base';
import { v7 as uuidv7 } from 'uuid';
import {
  BLOCK_PRE_COMMITS_EVENT,
  type ApiBlockPreCommit,
  type ApiBlockProposal,
  type BlockPreCommit,
  type BlockResponseApi,
  type MiniBlockPreCommitApi,
  type ModifiedSlot,
  type WSBlockPreCommits,
} from 'slot-watch-common';
import { serializeBlockPreCommit } from '../db/serializers';
import type { DbBlockPreCommit } from '../effect/layers/db';
import type { BlockPreCommitDb } from '../db/schema';

/**
 * Pure logic for `SignerMessage::BlockPreCommit` ingestion.
 *
 * This lives outside `stackerdb.ts` so it can be unit tested: `stackerdb.ts`
 * transitively imports `cloudflare:workers` (and, via `@clarigen/core`,
 * socket.io), neither of which loads in the test runners.
 */

/** Proposal lookup keyed by `signerSignatureHash`, shared by responses and pre-commits. */
export type ProposalsByHash = Record<string, ApiBlockProposal | undefined>;

/**
 * Tagged result of decoding + handling a single StackerDB chunk. Chunk types
 * that are fully handled inline (proposals, pushes, state machine updates)
 * return `null`; the two types that need the batched proposal join to compute
 * `latencyMs`/`blockHeight` return their API-shaped payload here.
 */
export type ProcessedChunk =
  | { kind: 'response'; data: BlockResponseApi }
  | { kind: 'preCommit'; data: ApiBlockPreCommit }
  | null;

/** Splits collected `processChunk` results into the two batched kinds. */
export function splitProcessedChunks(results: readonly ProcessedChunk[]) {
  const blockResponses: BlockResponseApi[] = [];
  const preCommits: ApiBlockPreCommit[] = [];
  for (const result of results) {
    if (result === null) {
      continue;
    }
    if (result.kind === 'response') {
      blockResponses.push(result.data);
    } else {
      preCommits.push(result.data);
    }
  }
  return { blockResponses, preCommits };
}

/**
 * Maps a decoded pre-commit chunk to its API shape. `latencyMs`/`blockHeight`
 * are left unset here and filled in by the batched proposal join, which is the
 * only place the matching proposal is known.
 */
export function mapBlockPreCommit({
  chunk,
  payload,
  receivedAt,
  networkKey,
  publicKey,
  chunkId,
}: {
  chunk: ModifiedSlot;
  payload: BlockPreCommit;
  receivedAt: Date;
  networkKey: string;
  publicKey: string;
  chunkId: string | null;
}): ApiBlockPreCommit {
  const data: BlockPreCommitDb = {
    id: uuidv7({ msecs: receivedAt.getTime() }),
    signerSignatureHash: hex.encode(payload.signerSignatureHash),
    slotId: chunk.slot_id,
    networkKey,
    signerPublicKey: publicKey,
    chunkId,
    latencyMs: null,
    blockHeight: null,
  };

  return serializeBlockPreCommit(data);
}

/**
 * Fills in the proposal-derived fields (`latencyMs`, `blockHeight`) shared by
 * block responses and pre-commits. A missing proposal — a pre-commit or
 * response that arrived before we saw the proposal — leaves both `undefined`.
 */
export function withProposalData<T extends { signerSignatureHash: string }>(
  items: T[],
  proposals: ProposalsByHash,
  receivedAt: Date,
  networkKey: string
) {
  return items.map((item) => {
    const proposal = proposals[item.signerSignatureHash];
    const latencyMs = proposal
      ? receivedAt.getTime() - new Date(proposal.createdAt).getTime()
      : undefined;
    return {
      ...item,
      networkKey,
      latencyMs,
      blockHeight: proposal?.chainLength,
    };
  });
}

/**
 * Turns joined pre-commits into the DB rows to insert and the slim SSE payload
 * to publish.
 */
export function buildPreCommitBatch({
  preCommits,
  proposals,
  receivedAt,
  networkKey,
}: {
  preCommits: ApiBlockPreCommit[];
  proposals: ProposalsByHash;
  receivedAt: Date;
  networkKey: string;
}): { rows: DbBlockPreCommit[]; wsPayload: WSBlockPreCommits } {
  const withData = withProposalData(
    preCommits,
    proposals,
    receivedAt,
    networkKey
  );

  const rows: DbBlockPreCommit[] = withData.map((p) => ({
    id: p.id,
    signerSignatureHash: p.signerSignatureHash,
    slotId: p.slotId,
    networkKey: p.networkKey,
    signerPublicKey: p.signerPublicKey,
    latencyMs: p.latencyMs ?? null,
    blockHeight: p.blockHeight ?? null,
  }));

  const payload: MiniBlockPreCommitApi[] = withData.map((p) => ({
    signerSignatureHash: p.signerSignatureHash,
    signerPublicKey: p.signerPublicKey,
    blockHeight: p.blockHeight,
  }));

  return {
    rows,
    wsPayload: {
      type: BLOCK_PRE_COMMITS_EVENT,
      networkKey,
      receivedAt: receivedAt.toISOString(),
      payload,
    },
  };
}
