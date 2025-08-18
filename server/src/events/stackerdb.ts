// Legacy imports - now using Effect-based implementation
import { ServerRuntime } from '../effect/runtime';
import { Effect } from 'effect';
import { hex } from '@scure/base';
import { v7 as uuidv7 } from 'uuid';
import * as R from 'remeda';
import {
  makeSignerSignatureHash,
  type BlockProposal,
  type BlockPushed,
  type ModifiedSlot,
  type StackerDBPayload,
  SignerMessageTypePrefix,
  recoverChunkPublicKey,
  type BlockResponseAccepted,
  type BlockResponseRejected,
  type WSBlockProposal,
  type WSMiniBlockResponses,
  BLOCK_PROPOSAL_EVENT,
  getVersionFromString,
  type ApiBlockProposal,
  type StateMachineUpdate,
  STATE_MACHINE_UPDATE_EVENT,
  type WSStateMachineUpdate,
  superSerialize,
  chunkTypeName,
  decodeChunk,
  MINI_BLOCK_RESPONSES_EVENT,
  type TypeMerge,
  type BlockResponseApi,
  type DecodedChunk,
} from 'slot-watch-common';
import {
  DbServiceTag,
  StreamerServiceTag,
  type DbBlockProposal,
  type DbBlockPush,
  type DbBlockResponse,
  type DbStateMachineUpdate,
  type DbService,
  type StreamerService,
} from '../effect/tags';
import {
  DecodeError,
  UnknownChunkError,
  PublicKeyRecoveryError,
  type ChunkPipelineError,
} from '../effect/errors';
import {
  serializeBlockResponse,
  setLatestBlockResponses,
} from '../db/block-responses';
import { setLatestBlockProposal } from '../db/block-proposals';
import { serializeStateMachineUpdate } from '../db/state-machines';

// Re-export legacy types for compatibility
export type {
  BlockProposal,
  BlockPushed,
  ModifiedSlot,
  StackerDBPayload,
  BlockResponseAccepted,
  BlockResponseRejected,
  WSBlockProposal,
  WSMiniBlockResponses,
  ApiBlockProposal,
  StateMachineUpdate,
  WSStateMachineUpdate,
  BlockResponseApi,
  DecodedChunk,
} from 'slot-watch-common';

// Main handler function - now uses Effect-based implementation
export async function handleStackerDBChunk(
  payload: StackerDBPayload,
  receivedAt: Date,
  networkKey: string,
) {
  await Effect.runPromise(
    handleStackerDBChunkE({ payload, receivedAt, networkKey }).pipe(
      Effect.provide(ServerRuntime),
      Effect.tapErrorCause((cause) =>
        Effect.logError('Error processing StackerDB chunk', { cause }),
      ),
    ),
  );
}

export const handleBlockProposalE = ({
  payload,
  receivedAt,
  networkKey,
  publicKey,
  chunkId,
}: {
  payload: BlockProposal;
  receivedAt: Date;
  networkKey: string;
  publicKey: string;
  chunkId: string | null;
}) =>
  Effect.gen(function* () {
    const signerSignatureHash = makeSignerSignatureHash(payload);
    const id = uuidv7({ msecs: receivedAt.getTime() });

    const dbBlockProposal: DbBlockProposal = {
      signerSignatureHash: hex.encode(signerSignatureHash),
      chainLength: Number(payload.chainLength),
      id,
      networkKey,
      minerPublicKey: publicKey,
      consensusHash: hex.encode(payload.consensusHash),
      chunkId,
      txCount: payload.txCount,
      tenureChangeCause: payload.tenureChangeCause ?? null,
      burnBlockHeight: Number(payload.blockHeight),
      serverVersion: payload.serverVersion ?? null,
      blockTimestamp: new Date(Number(payload.timestamp) * 1000),
      txFees: Number(payload.txFees),
    };

    const blockProposal: ApiBlockProposal = {
      signerSignatureHash: dbBlockProposal.signerSignatureHash,
      chainLength: dbBlockProposal.chainLength,
      createdAt: receivedAt.toISOString(),
      networkKey: dbBlockProposal.networkKey,
      chunkId: dbBlockProposal.chunkId ?? null,
      minerPublicKey: dbBlockProposal.minerPublicKey,
      consensusHash: dbBlockProposal.consensusHash,
      tenureChangeCause: dbBlockProposal.tenureChangeCause ?? null,
      txCount: dbBlockProposal.txCount,
      burnBlockHeight: dbBlockProposal.burnBlockHeight,
      serverVersion: dbBlockProposal.serverVersion ?? null,
      blockTimestamp: dbBlockProposal.blockTimestamp.toISOString(),
      serverVersionShort: getVersionFromString(
        dbBlockProposal.serverVersion ?? '',
      ),
      txFees: dbBlockProposal.txFees ?? 0,
    };

    const wsPayload: WSBlockProposal = {
      type: BLOCK_PROPOSAL_EVENT,
      networkKey,
      receivedAt: receivedAt.toISOString(),
      payload: blockProposal,
    };

    yield* Effect.logInfo('Inserting block proposal', {
      signerSignatureHash: dbBlockProposal.signerSignatureHash,
      chainLength: dbBlockProposal.chainLength,
      topic: 'stackerdb-events',
      table: 'block_proposals',
    });

    // Get services
    const db = yield* DbServiceTag;
    const streamer = yield* StreamerServiceTag;

    // Run database insertion, WebSocket publishing, and cache update in parallel
    yield* Effect.all(
      [
        db.insertBlockProposal(dbBlockProposal),
        streamer.publish(wsPayload),
        Effect.tryPromise({
          try: () => setLatestBlockProposal(blockProposal),
          catch: (e) => new DecodeError(e),
        }),
      ],
      { concurrency: 'unbounded' },
    );
  });

export const handleBlockPushE = ({
  payload,
  receivedAt,
  networkKey,
  publicKey,
  chunkId,
}: {
  payload: BlockPushed;
  receivedAt: Date;
  networkKey: string;
  publicKey: string;
  chunkId: string | null;
}) =>
  Effect.gen(function* () {
    const signerSignatureHash = makeSignerSignatureHash(payload);
    const id = uuidv7({ msecs: receivedAt.getTime() });

    const dbBlockPush: DbBlockPush = {
      signerSignatureHash: hex.encode(signerSignatureHash),
      chainLength: Number(payload.chainLength),
      id,
      networkKey,
      minerPublicKey: publicKey,
      chunkId,
    };

    const db = yield* DbServiceTag;
    yield* db.insertBlockPush(dbBlockPush);
  });

type BlockAccept = TypeMerge<BlockResponseAccepted, BlockResponseRejected>;
type BlockReject = TypeMerge<BlockResponseRejected, BlockResponseAccepted>;

export const handleBlockResponseE = ({
  chunk,
  payload,
  receivedAt,
  networkKey,
  publicKey,
  chunkId,
}: {
  chunk: ModifiedSlot;
  payload: BlockAccept | BlockReject;
  receivedAt: Date;
  networkKey: string;
  publicKey: string;
  chunkId: string | null;
}) =>
  // biome-ignore lint/correctness/useYield: <explanation>
  Effect.gen(function* () {
    const tenureExtendTimestamp = payload.data.tenureExtendTimestamp
      ? new Date(Number(payload.data.tenureExtendTimestamp) * 1000)
      : null;
    const signerSignatureHash = hex.encode(payload.signerSignatureHash);
    const id = uuidv7({ msecs: receivedAt.getTime() });

    const data = {
      signerSignatureHash,
      slotId: chunk.slot_id,
      id,
      networkKey,
      signerPublicKey: publicKey,
      accepted: payload.accepted,
      chunkId,
      tenureExtendTimestamp,
      reason: payload.reason ?? null,
      rejectCode: payload.reasonCode ?? null,
      validationCode: payload.validationCode ?? null,
      version: payload.metadata ?? null,
      rejectReason: payload.data.rejectReason ?? null,
      latencyMs: null,
      blockHeight: null,
    };

    const blockResponse: BlockResponseApi = serializeBlockResponse(data);

    return blockResponse;
  });

export const handleStateMachineUpdateE = ({
  payload,
  receivedAt,
  networkKey,
  chunkId,
  publicKey,
}: {
  payload: StateMachineUpdate;
  receivedAt: Date;
  networkKey: string;
  publicKey: string;
  chunkId: string | null;
}) =>
  Effect.gen(function* () {
    const updateContent = superSerialize(payload.stateMachineUpdate);
    const id = uuidv7({ msecs: receivedAt.getTime() });

    const dbStateMachineUpdate = {
      signerPublicKey: publicKey,
      networkKey,
      chunkId,
      id,
      activeSignerProtocolVersion: Number(payload.activeSignerProtocolVersion),
      localSignerProtocolVersion: Number(payload.localSignerProtocolVersion),
      updateContent,
    } satisfies DbStateMachineUpdate;

    const wsPayload: WSStateMachineUpdate = {
      type: STATE_MACHINE_UPDATE_EVENT,
      networkKey,
      receivedAt: receivedAt.toISOString(),
      payload: serializeStateMachineUpdate(dbStateMachineUpdate),
    };

    yield* Effect.logInfo('Inserting state machine update', {
      updateContentType: typeof payload.stateMachineUpdate,
      topic: 'stackerdb-events',
      table: 'state_machine_updates',
    });

    const db = yield* DbServiceTag;
    const streamer = yield* StreamerServiceTag;

    yield* Effect.all(
      [
        db.insertStateMachineUpdate(dbStateMachineUpdate),
        streamer.publish(wsPayload),
      ],
      { concurrency: 'unbounded' },
    );
  });

const processChunk = (
  chunk: ModifiedSlot,
  receivedAt: Date,
  networkKey: string,
): Effect.Effect<
  BlockResponseApi | null,
  ChunkPipelineError,
  DbService | StreamerService
> =>
  Effect.gen(function* () {
    // Decode chunk data
    const chunkData = yield* Effect.try({
      try: () => hex.decode(chunk.data),
      catch: (e) => new DecodeError(e),
    });

    const chunkType = chunkTypeName(chunkData);
    const id = uuidv7({ msecs: receivedAt.getTime() });
    const chunkId = id;

    // Recover public key
    const publicKey = yield* Effect.try({
      try: () =>
        recoverChunkPublicKey({
          data: hex.decode(chunk.data),
          slotId: chunk.slot_id,
          version: chunk.slot_version,
          signature: hex.decode(chunk.sig),
        }).toHex(),
      catch: (e) => new PublicKeyRecoveryError(e),
    });

    // Decode chunk
    const decoded: DecodedChunk = yield* Effect.try({
      try: () => decodeChunk(chunkData),
      catch: (e) => new DecodeError(e),
    });

    // Route to appropriate handler based on chunk type
    if (decoded.typeId === SignerMessageTypePrefix.BlockProposal) {
      yield* handleBlockProposalE({
        payload: decoded,
        receivedAt,
        networkKey,
        publicKey,
        chunkId,
      });
      return null;
    }
    if (decoded.typeId === SignerMessageTypePrefix.BlockPushed) {
      yield* handleBlockPushE({
        payload: decoded,
        receivedAt,
        networkKey,
        publicKey,
        chunkId,
      });
      return null;
    }
    if (decoded.typeId === SignerMessageTypePrefix.BlockResponse) {
      const response = yield* handleBlockResponseE({
        chunk,
        payload: decoded,
        receivedAt,
        networkKey,
        publicKey,
        chunkId,
      });
      return response;
    }
    if (decoded.typeId === SignerMessageTypePrefix.StateMachineUpdate) {
      yield* handleStateMachineUpdateE({
        payload: decoded,
        receivedAt,
        networkKey,
        chunkId,
        publicKey,
      });
      return null;
    }
    yield* Effect.fail(new UnknownChunkError(decoded.typeId));
    return null;
  });

export const handleStackerDBChunkE = ({
  payload,
  receivedAt,
  networkKey,
}: {
  payload: StackerDBPayload;
  receivedAt: Date;
  networkKey: string;
}): Effect.Effect<void, ChunkPipelineError, DbService | StreamerService> =>
  Effect.gen(function* () {
    // Process all chunks in parallel, collecting block responses
    const results = yield* Effect.forEach(
      payload.modified_slots,
      (chunk) => processChunk(chunk, receivedAt, networkKey),
      { concurrency: 'unbounded' },
    );

    // Filter out null results to get only block responses
    const blockResponses: BlockResponseApi[] = results.filter(
      (r): r is BlockResponseApi => r !== null,
    );

    if (blockResponses.length > 0) {
      yield* Effect.logInfo(
        `Inserting ${blockResponses.length} block responses`,
      );

      const blockHashes = R.pipe(
        blockResponses,
        R.map((r) => r.signerSignatureHash),
        R.unique(),
      );

      const db = yield* DbServiceTag;
      const blockProposalsList =
        yield* db.fetchBlockProposalsByHash(blockHashes);
      const blockProposals = R.pipe(
        blockProposalsList,
        R.groupBy((r: ApiBlockProposal) => r.signerSignatureHash),
        R.mapValues((v: ApiBlockProposal[]) => v[0]),
      );

      const blockResponsesWithData = blockResponses.map((r) => {
        const proposal = blockProposals[r.signerSignatureHash];
        const latencyMs = proposal
          ? receivedAt.getTime() - new Date(proposal.createdAt).getTime()
          : undefined;
        const blockHeight = proposal?.chainLength;
        return {
          ...r,
          networkKey,
          latencyMs,
          blockHeight,
        };
      });

      // Convert to database format
      const dbBlockResponses: DbBlockResponse[] = blockResponsesWithData.map(
        (r) => ({
          ...r,
          tenureExtendTimestamp: r.tenureExtendTimestamp
            ? new Date(r.tenureExtendTimestamp)
            : null,
          createdAt: new Date(r.createdAt),
        }),
      );

      const wsPayload: WSMiniBlockResponses = {
        type: MINI_BLOCK_RESPONSES_EVENT,
        networkKey,
        receivedAt: receivedAt.toISOString(),
        payload: blockResponsesWithData,
      };

      const streamer = yield* StreamerServiceTag;

      yield* Effect.all(
        [
          db.insertBlockResponses(dbBlockResponses),
          streamer.publish(wsPayload),
          Effect.tryPromise({
            try: () => setLatestBlockResponses(blockResponsesWithData),
            catch: (e) => new DecodeError(e),
          }),
        ],
        { concurrency: 'unbounded' },
      );
    }
  });
