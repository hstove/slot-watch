import { describe, expect, test } from 'bun:test';
import { hex } from '@scure/base';
import {
  BLOCK_PRE_COMMITS_EVENT,
  BlockPreCommitCoder,
  decodeChunk,
  recoverChunkPublicKey,
  signChunkData,
  SignerMessageTypePrefix,
  type ApiBlockPreCommit,
  type ApiBlockProposal,
  type BlockResponseApi,
  type ModifiedSlot,
} from 'slot-watch-common';
import {
  buildPreCommitBatch,
  mapBlockPreCommit,
  splitProcessedChunks,
  withProposalData,
  type ProcessedChunk,
  type ProposalsByHash,
} from '../src/events/pre-commits';

/**
 * Covers the pre-commit half of the `/stackerdb_chunks` pipeline: wire format,
 * signer recovery, the chunk -> API mapper, the shared proposal join, and the
 * DB rows + SSE payload built from it.
 *
 * `handleStackerDBChunk` itself is not exercised here: it transitively imports
 * `cloudflare:workers` and (via `@clarigen/core`) socket.io, neither of which
 * loads under the workers vitest pool. The pre-commit logic it calls is
 * extracted into `src/events/pre-commits.ts` precisely so it can be tested.
 */

const NETWORK_KEY = 'test-net';
const SIGNER_PRIVATE_KEY = hex.decode(
  '1111111111111111111111111111111111111111111111111111111111111111'
);
/**
 * Compressed secp256k1 pubkey for the private key above. Hard-coded so the
 * assertions pin an independently-known value instead of echoing whatever the
 * recovery path produces; the first test proves the fixture recovers to it.
 */
const SIGNER_PUBLIC_KEY =
  '034f355bdcb7cc0af728ef3cceb9615d90684bb5b2ca5f859ab0f0b704075871aa';
const SIGNER_SIGNATURE_HASH =
  'aabbccddeeff00112233445566778899aabbccddeeff00112233445566778899';

/**
 * Builds a signed type-7 StackerDB chunk the way a signer does: a 33-byte
 * payload (`0x07` + raw 32-byte hash) plus a recoverable secp256k1 signature
 * over `sha512_256(be32(slot_id) || be32(slot_version) || sha512_256(data))`.
 */
function preCommitChunk({
  signerSignatureHash = SIGNER_SIGNATURE_HASH,
  slotId = 3,
  version = 1,
}: {
  signerSignatureHash?: string;
  slotId?: number;
  version?: number;
} = {}): ModifiedSlot {
  const data = BlockPreCommitCoder.encode({
    typeId: SignerMessageTypePrefix.BlockPreCommit,
    signerSignatureHash: hex.decode(signerSignatureHash),
  });
  const sig = signChunkData({
    data,
    slotId,
    version,
    privateKey: SIGNER_PRIVATE_KEY,
  });
  return {
    data: hex.encode(data),
    sig: hex.encode(sig),
    slot_id: slotId,
    slot_version: version,
  };
}

/** Mirrors what `processChunk` does for a type-7 chunk. */
function ingestChunk(chunk: ModifiedSlot, receivedAt: Date): ApiBlockPreCommit {
  const chunkData = hex.decode(chunk.data);
  const decoded = decodeChunk(chunkData);
  if (decoded.typeId !== SignerMessageTypePrefix.BlockPreCommit) {
    throw new Error(`Expected a pre-commit chunk, got type ${decoded.typeId}`);
  }

  const publicKey = recoverChunkPublicKey({
    data: chunkData,
    slotId: chunk.slot_id,
    version: chunk.slot_version,
    signature: hex.decode(chunk.sig),
  }).toHex();

  return mapBlockPreCommit({
    chunk,
    payload: decoded,
    receivedAt,
    networkKey: NETWORK_KEY,
    publicKey,
    chunkId: 'chunk-1',
  });
}

function makeProposal(
  createdAt: Date,
  signerSignatureHash = SIGNER_SIGNATURE_HASH
): ApiBlockProposal {
  return {
    signerSignatureHash,
    chainLength: 4321,
    createdAt: createdAt.toISOString(),
    networkKey: NETWORK_KEY,
    chunkId: null,
    minerPublicKey: `02${'0'.repeat(64)}`,
    consensusHash: '00'.repeat(20),
    tenureChangeCause: null,
    txCount: 0,
    burnBlockHeight: 100,
    serverVersion: null,
    blockTimestamp: createdAt.toISOString(),
    serverVersionShort: null,
    txFees: 0,
  };
}

describe('block pre-commit wire format', () => {
  test('encodes to 0x07 followed by the raw 32-byte hash', () => {
    const chunk = preCommitChunk();
    const data = hex.decode(chunk.data);
    expect(data).toHaveLength(33);
    expect(data[0]).toBe(SignerMessageTypePrefix.BlockPreCommit);
    expect(hex.encode(data.slice(1))).toBe(SIGNER_SIGNATURE_HASH);
  });

  test('the synthetic chunk fixture recovers to the signing key', () => {
    const chunk = preCommitChunk({ slotId: 7, version: 2 });
    const recovered = recoverChunkPublicKey({
      data: hex.decode(chunk.data),
      slotId: chunk.slot_id,
      version: chunk.slot_version,
      signature: hex.decode(chunk.sig),
    });
    expect(recovered.toHex()).toBe(SIGNER_PUBLIC_KEY);
  });
});

describe('mapBlockPreCommit', () => {
  test('maps the decoded hash, recovered pubkey, slot and network', () => {
    const receivedAt = new Date('2026-08-04T00:00:00.000Z');
    const preCommit = ingestChunk(
      preCommitChunk({ slotId: 7, version: 2 }),
      receivedAt
    );

    expect(preCommit.signerSignatureHash).toBe(SIGNER_SIGNATURE_HASH);
    expect(preCommit.signerPublicKey).toBe(SIGNER_PUBLIC_KEY);
    expect(preCommit.slotId).toBe(7);
    expect(preCommit.networkKey).toBe(NETWORK_KEY);
    expect(preCommit.createdAt).toBe(receivedAt.toISOString());
    // Filled in later, by the batched proposal join.
    expect(preCommit.latencyMs).toBeUndefined();
    expect(preCommit.blockHeight).toBeUndefined();
  });
});

describe('splitProcessedChunks', () => {
  test('separates responses from pre-commits and drops nulls', () => {
    const response = { signerSignatureHash: 'r' } as BlockResponseApi;
    const preCommit = { signerSignatureHash: 'p' } as ApiBlockPreCommit;
    const results: ProcessedChunk[] = [
      { kind: 'response', data: response },
      null,
      { kind: 'preCommit', data: preCommit },
      null,
    ];

    const { blockResponses, preCommits } = splitProcessedChunks(results);
    expect(blockResponses).toEqual([response]);
    expect(preCommits).toEqual([preCommit]);
  });
});

describe('withProposalData', () => {
  test('computes latency from the proposal and carries blockHeight over', () => {
    const proposalCreatedAt = new Date('2026-08-04T00:00:00.000Z');
    const receivedAt = new Date(proposalCreatedAt.getTime() + 1234);
    const proposals: ProposalsByHash = {
      [SIGNER_SIGNATURE_HASH]: makeProposal(proposalCreatedAt),
    };

    const [joined] = withProposalData(
      [{ signerSignatureHash: SIGNER_SIGNATURE_HASH }],
      proposals,
      receivedAt,
      NETWORK_KEY
    );

    expect(joined?.latencyMs).toBe(1234);
    expect(joined?.blockHeight).toBe(4321);
    expect(joined?.networkKey).toBe(NETWORK_KEY);
  });

  test('leaves latency and height unset when the proposal is unknown', () => {
    const [joined] = withProposalData(
      [{ signerSignatureHash: SIGNER_SIGNATURE_HASH }],
      {},
      new Date(),
      NETWORK_KEY
    );

    expect(joined?.latencyMs).toBeUndefined();
    expect(joined?.blockHeight).toBeUndefined();
  });
});

describe('buildPreCommitBatch', () => {
  test('builds DB rows and the SSE payload when the proposal is known', () => {
    const proposalCreatedAt = new Date('2026-08-04T00:00:00.000Z');
    const receivedAt = new Date(proposalCreatedAt.getTime() + 500);
    const preCommit = ingestChunk(preCommitChunk({ slotId: 9 }), receivedAt);

    const { rows, wsPayload } = buildPreCommitBatch({
      preCommits: [preCommit],
      proposals: {
        [SIGNER_SIGNATURE_HASH]: makeProposal(proposalCreatedAt),
      },
      receivedAt,
      networkKey: NETWORK_KEY,
    });

    expect(rows).toHaveLength(1);
    expect(rows[0]).toEqual({
      id: preCommit.id,
      signerSignatureHash: SIGNER_SIGNATURE_HASH,
      slotId: 9,
      networkKey: NETWORK_KEY,
      signerPublicKey: SIGNER_PUBLIC_KEY,
      latencyMs: 500,
      blockHeight: 4321,
    });

    // Deliberately slim: only what the block-detail bar needs.
    expect(wsPayload).toEqual({
      type: BLOCK_PRE_COMMITS_EVENT,
      networkKey: NETWORK_KEY,
      receivedAt: receivedAt.toISOString(),
      payload: [
        {
          signerSignatureHash: SIGNER_SIGNATURE_HASH,
          signerPublicKey: SIGNER_PUBLIC_KEY,
          blockHeight: 4321,
        },
      ],
    });
  });

  test('nulls latency and height for a pre-commit that beat its proposal', () => {
    const receivedAt = new Date('2026-08-04T00:00:00.000Z');
    const preCommit = ingestChunk(preCommitChunk(), receivedAt);

    const { rows, wsPayload } = buildPreCommitBatch({
      preCommits: [preCommit],
      proposals: {},
      receivedAt,
      networkKey: NETWORK_KEY,
    });

    expect(rows[0]?.latencyMs).toBeNull();
    expect(rows[0]?.blockHeight).toBeNull();
    expect(wsPayload.payload[0]?.blockHeight).toBeUndefined();
  });

  test('batches multiple pre-commits, joining each against its own proposal', () => {
    const otherHash = '11'.repeat(32);
    const proposalCreatedAt = new Date('2026-08-04T00:00:00.000Z');
    const receivedAt = new Date(proposalCreatedAt.getTime() + 100);

    const preCommits = [
      ingestChunk(preCommitChunk({ slotId: 1 }), receivedAt),
      ingestChunk(
        preCommitChunk({ signerSignatureHash: otherHash, slotId: 2 }),
        receivedAt
      ),
    ];

    const { rows } = buildPreCommitBatch({
      preCommits,
      // Only the first hash has a known proposal.
      proposals: {
        [SIGNER_SIGNATURE_HASH]: makeProposal(proposalCreatedAt),
      },
      receivedAt,
      networkKey: NETWORK_KEY,
    });

    expect(rows).toHaveLength(2);
    expect(rows[0]?.latencyMs).toBe(100);
    expect(rows[0]?.blockHeight).toBe(4321);
    expect(rows[1]?.signerSignatureHash).toBe(otherHash);
    expect(rows[1]?.latencyMs).toBeNull();
    expect(rows[1]?.blockHeight).toBeNull();
  });
});
