import {
  makeSignerSignatureHash,
  type BlockProposal,
  type BlockPushed,
  type ModifiedSlot,
  type StackerDBPayload,
  SignerMessageTypePrefix,
  decodeChunkMaybe,
  recoverChunkPublicKey,
  type TypeMerge,
  type BlockResponseAccepted,
  type BlockResponseRejected,
  type WSBlockProposal,
  type WSMiniBlockResponses,
  BLOCK_PROPOSAL_EVENT,
  type WSBlockResponse,
  BLOCK_RESPONSE_EVENT,
  getVersionFromString,
  type ApiBlockProposal,
  type StateMachineUpdate,
  STATE_MACHINE_UPDATE_EVENT,
  type WSStateMachineUpdate,
  superSerialize,
  chunkTypeName,
  decodeChunk,
  MINI_BLOCK_RESPONSES_EVENT,
} from 'slot-watch-common';
import type { Db } from '../db/db';
import { getCreatedAt, getPayloadContractId } from '../utils';
import {
  blockProposals,
  blockPushes,
  blockResponses as blockResponsesTable,
  stackerDbSlots,
  stateMachineUpdates,
} from '../db/schema';
import { hex } from '@scure/base';
import { log, logger } from '../logger';
import {
  serializeBlockResponse,
  setLatestBlockResponse,
  setLatestBlockResponses,
} from '../db/block-responses';
// import { publishWsEvent } from '../redis';
import {
  fetchBlockProposalsByHash,
  setLatestBlockProposal,
} from '../db/block-proposals';
import type { InferInsertModel } from 'drizzle-orm';
import { serializeStateMachineUpdate } from '../db/state-machines';
import { sql } from 'drizzle-orm';
import { DrizzleQueryError } from 'drizzle-orm/errors';
import type {
  BlockResponseApi,
  ChunkType,
  DecodedChunk,
  SuperJSON,
} from 'slot-watch-common';
import { stackerDbChunkProcessingTimeSummary } from '../metrics';
import { v7 as uuidv7 } from 'uuid';
import { publishWsEventToStreamer } from '../streamer';
import { env } from 'cloudflare:workers';
import * as R from 'remeda';

export async function handleStackerDBChunk(
  payload: StackerDBPayload,
  receivedAt: Date,
  networkKey: string,
  db: Db,
) {
  const contractId = getPayloadContractId(payload);

  console.log(env.DATABASE_URL);

  const blockResponses: BlockResponseApi[] = [];

  const promises: Promise<void>[] = [];

  // for (const chunk of payload.modified_slots) {
  await Promise.all(
    payload.modified_slots.map(async (chunk) => {
      const chunkData = hex.decode(chunk.data);
      const chunkType = chunkTypeName(chunkData);
      const id = uuidv7({ msecs: receivedAt.getTime() });
      const publicKey = recoverChunkPublicKey({
        data: hex.decode(chunk.data),
        slotId: chunk.slot_id,
        version: chunk.slot_version,
        signature: hex.decode(chunk.sig),
      }).toHex();

      const chunkId = id;

      let decoded: DecodedChunk;
      try {
        decoded = decodeChunk(chunkData);
      } catch (error) {
        log
          .withError(error)
          .withMetadata({
            chunk,
          })
          .error('Error decoding chunk');
        return;
      }
      if (decoded.typeId === SignerMessageTypePrefix.BlockProposal) {
        await Promise.all([
          handleBlockProposal({
            payload: decoded,
            receivedAt,
            networkKey,
            publicKey,
            chunkId,
            db,
          }),
        ]);
      } else if (decoded.typeId === SignerMessageTypePrefix.BlockPushed) {
        await Promise.all([
          handleBlockPush({
            payload: decoded,
            receivedAt,
            networkKey,
            publicKey,
            chunkId,
            db,
          }),
        ]);
      } else if (decoded.typeId === SignerMessageTypePrefix.BlockResponse) {
        const handleProposals = true;
        if (handleProposals) {
          const response = await handleBlockResponse({
            chunk,
            payload: decoded,
            receivedAt,
            networkKey,
            publicKey,
            chunkId,
            db,
          });
          blockResponses.push(response);
        }
      } else if (
        decoded.typeId === SignerMessageTypePrefix.StateMachineUpdate
      ) {
        await Promise.all([
          handleStateMachineUpdate({
            payload: decoded,
            receivedAt,
            networkKey,
            chunkId,
            publicKey,
            db,
          }),
        ]);
      }
    }),
  );
  // }

  // await Promise.all(promises);

  if (blockResponses.length > 0) {
    logger.info(`Inserting ${blockResponses.length} block responses`);
    const blockHashes = R.pipe(
      blockResponses,
      R.map((r) => r.signerSignatureHash),
      R.unique(),
    );
    const blockProposalsList = await fetchBlockProposalsByHash(blockHashes, db);
    const blockProposals = R.pipe(
      blockProposalsList,
      R.groupBy((r) => r.signerSignatureHash),
      R.mapValues((v) => v[0]),
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

    await Promise.all([
      db.insert(blockResponsesTable).values(
        blockResponsesWithData.map((r) => ({
          ...r,
          tenureExtendTimestamp: r.tenureExtendTimestamp
            ? new Date(r.tenureExtendTimestamp)
            : null,
          createdAt: new Date(r.createdAt),
        })),
      ),
      publishWsEventToStreamer({
        type: MINI_BLOCK_RESPONSES_EVENT,
        networkKey,
        receivedAt: receivedAt.toISOString(),
        payload: blockResponsesWithData,
      } satisfies WSMiniBlockResponses),
      setLatestBlockResponses(blockResponsesWithData),
    ]);
  }
}

export async function handleBlockProposal({
  payload,
  receivedAt,
  networkKey,
  publicKey,
  chunkId,
  db,
}: {
  payload: BlockProposal;
  receivedAt: Date;
  networkKey: string;
  publicKey: string;
  chunkId: string | null;
  db: Db;
}) {
  const signerSignatureHash = makeSignerSignatureHash(payload);
  const id = uuidv7({ msecs: receivedAt.getTime() });
  const dbBlockProposal = {
    signerSignatureHash: hex.encode(signerSignatureHash),
    chainLength: Number(payload.chainLength),
    id,
    networkKey,
    minerPublicKey: publicKey,
    consensusHash: hex.encode(payload.consensusHash),
    chunkId,
    txCount: payload.txCount,
    tenureChangeCause: payload.tenureChangeCause,
    burnBlockHeight: Number(payload.blockHeight),
    serverVersion: payload.serverVersion,
    blockTimestamp: new Date(Number(payload.timestamp) * 1000),
    txFees: Number(payload.txFees),
  } satisfies InferInsertModel<typeof blockProposals>;
  logger.debug(
    {
      ...dbBlockProposal,
      topic: 'stackerdb-events',
      table: 'block_proposals',
    },
    'Inserting block proposal',
  );
  await db.insert(blockProposals).values(dbBlockProposal);
  const blockProposal: ApiBlockProposal = {
    ...dbBlockProposal,
    createdAt: receivedAt.toISOString(),
    blockTimestamp: dbBlockProposal.blockTimestamp.toISOString(),
    serverVersionShort: getVersionFromString(dbBlockProposal.serverVersion),
  };

  await publishWsEventToStreamer({
    type: BLOCK_PROPOSAL_EVENT,
    networkKey,
    receivedAt: receivedAt.toISOString(),
    payload: blockProposal,
  } satisfies WSBlockProposal);
  await setLatestBlockProposal(blockProposal);
}

export async function handleBlockPush({
  payload,
  receivedAt,
  networkKey,
  publicKey,
  chunkId,
  db,
}: {
  payload: BlockPushed;
  receivedAt: Date;
  networkKey: string;
  publicKey: string;
  chunkId: string | null;
  db: Db;
}) {
  const signerSignatureHash = makeSignerSignatureHash(payload);
  const id = uuidv7({ msecs: receivedAt.getTime() });
  await db.insert(blockPushes).values({
    signerSignatureHash: hex.encode(signerSignatureHash),
    chainLength: Number(payload.chainLength),
    id,
    networkKey,
    minerPublicKey: publicKey,
    chunkId,
  });
}

type BlockAccept = TypeMerge<BlockResponseAccepted, BlockResponseRejected>;

type BlockReject = TypeMerge<BlockResponseRejected, BlockResponseAccepted>;

export async function handleBlockResponse({
  chunk,
  payload,
  receivedAt,
  networkKey,
  publicKey,
  chunkId,
  db,
}: {
  chunk: ModifiedSlot;
  payload: BlockAccept | BlockReject;
  receivedAt: Date;
  networkKey: string;
  publicKey: string;
  chunkId: string | null;
  db: Db;
}) {
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
  } satisfies InferInsertModel<typeof blockResponsesTable>;
  const blockResponse: BlockResponseApi = serializeBlockResponse({
    ...data,
    id,
  });
  return blockResponse;
}

export async function handleStateMachineUpdate({
  payload,
  receivedAt,
  networkKey,
  chunkId,
  publicKey,
  db,
}: {
  payload: StateMachineUpdate;
  receivedAt: Date;
  networkKey: string;
  publicKey: string;
  chunkId: string | null;
  db: Db;
}) {
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
    // updateContent: sql<
    //   SuperJSON<StateMachineUpdate['stateMachineUpdate']>
    // >`${updateContent}::json`,
  } satisfies InferInsertModel<typeof stateMachineUpdates>;
  logger.debug(
    {
      updateContentType: typeof payload.stateMachineUpdate,
      // updateContent: payload.stateMachineUpdate,
      topic: 'stackerdb-events',
      table: 'state_machine_updates',
    },
    'Inserting state machine update',
  );
  await Promise.all([
    db.insert(stateMachineUpdates).values({
      ...dbStateMachineUpdate,
      // updateContent: sql<
      //   SuperJSON<StateMachineUpdate['stateMachineUpdate']>
      // >`${updateContent}::json`,
    }),
    publishWsEventToStreamer({
      type: STATE_MACHINE_UPDATE_EVENT,
      networkKey,
      receivedAt: receivedAt.toISOString(),
      payload: serializeStateMachineUpdate({
        ...dbStateMachineUpdate,
        id,
      }),
    } satisfies WSStateMachineUpdate),
  ]);
}
