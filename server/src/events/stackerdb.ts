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
import { db } from '../db/db';
import { getCreatedAt, getPayloadContractId } from '../utils';
import {
  blockProposals,
  blockPushes,
  blockResponses,
  stackerDbSlots,
  stateMachineUpdates,
} from '../db/schema';
import { hex } from '@scure/base';
import { log, logger } from '../logger';
import {
  serializeBlockResponse,
  setLatestBlockResponse,
} from '../db/block-responses';
// import { publishWsEvent } from '../redis';
import { setLatestBlockProposal } from '../db/block-proposals';
import type { InferInsertModel } from 'drizzle-orm';
import { serializeStateMachineUpdate } from '../db/state-machines';
import { sql } from 'drizzle-orm';
import type {
  BlockResponseApi,
  ChunkType,
  DecodedChunk,
  SuperJSON,
} from 'slot-watch-common';
import { stackerDbChunkProcessingTimeSummary } from '../metrics';
import { v7 as uuidv7 } from 'uuid';
import { publishWsEventToStreamer } from '../streamer';

export async function handleStackerDBChunk(
  payload: StackerDBPayload,
  receivedAt: Date,
  networkKey: string,
) {
  const contractId = getPayloadContractId(payload);

  const blockResponses: BlockResponseApi[] = [];

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
      await db.insert(stackerDbSlots).values({
        slotId: chunk.slot_id,
        version: chunk.slot_version,
        contractId,
        networkKey,
        signature: hex.decode(chunk.sig),
        data: hex.decode(chunk.data),
        id,
        publicKey,
      });
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
        await handleBlockProposal({
          payload: decoded,
          receivedAt,
          networkKey,
          publicKey,
          chunkId,
        });
      } else if (decoded.typeId === SignerMessageTypePrefix.BlockPushed) {
        await handleBlockPush({
          payload: decoded,
          receivedAt,
          networkKey,
          publicKey,
          chunkId,
        });
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
          });
          blockResponses.push(response);
        }
      } else if (
        decoded.typeId === SignerMessageTypePrefix.StateMachineUpdate
      ) {
        await handleStateMachineUpdate({
          payload: decoded,
          receivedAt,
          networkKey,
          chunkId,
          publicKey,
        });
      }
    }),
  );

  if (blockResponses.length > 0) {
    await publishWsEventToStreamer({
      type: MINI_BLOCK_RESPONSES_EVENT,
      networkKey,
      receivedAt: receivedAt.toISOString(),
      payload: blockResponses.map((r) => ({
        signerSignatureHash: r.signerSignatureHash,
        signerPublicKey: r.signerPublicKey,
        accepted: r.accepted,
        tenureExtendTimestamp: r.tenureExtendTimestamp,
      })),
    } satisfies WSMiniBlockResponses);
  }
}

export async function handleBlockProposal({
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
}: {
  payload: BlockPushed;
  receivedAt: Date;
  networkKey: string;
  publicKey: string;
  chunkId: string | null;
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
}: {
  chunk: ModifiedSlot;
  payload: BlockAccept | BlockReject;
  receivedAt: Date;
  networkKey: string;
  publicKey: string;
  chunkId: string | null;
}) {
  const tenureExtendTimestamp = payload.data.tenureExtendTimestamp
    ? new Date(Number(payload.data.tenureExtendTimestamp) * 1000)
    : null;
  const signerSignatureHash = hex.encode(payload.signerSignatureHash);
  let latencyMs: number | null = null;
  const blockProposal = await db.query.blockProposals.findFirst({
    where(fields, operators) {
      return operators.eq(fields.signerSignatureHash, signerSignatureHash);
    },
  });
  if (blockProposal) {
    const createdAt = getCreatedAt(blockProposal.id);
    latencyMs = receivedAt.getTime() - createdAt.getTime();
  }
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
    latencyMs,
  } satisfies InferInsertModel<typeof blockResponses>;
  logger.debug(
    {
      ...data,
      topic: 'stackerdb-events',
      table: 'block_responses',
    },
    'Inserting block response',
  );
  const blockResponse: BlockResponseApi = serializeBlockResponse({
    ...data,
    id,
  });
  await Promise.all([
    await db.insert(blockResponses).values(data),
    await setLatestBlockResponse(blockResponse),
    // await publishWsEventToStreamer({
    //   type: BLOCK_RESPONSE_EVENT,
    //   networkKey,
    //   receivedAt: receivedAt.toISOString(),
    //   payload: blockResponse,
    // } satisfies WSBlockResponse),
  ]);
  return blockResponse;
}

export async function handleStateMachineUpdate({
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
