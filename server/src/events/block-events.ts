import {
  type WSNewBlockV2,
  BURN_BLOCK_V2_EVENT,
  NEW_BLOCK_V2_EVENT,
  type WSBurnBlockV2,
} from 'slot-watch-common';
import { burnBlocks, stacksBlocks } from '../db/schema';
import { recentBlocksHealthCache } from '../db/block-proposals';
import type { InferInsertModel } from 'drizzle-orm';
import { v7 as uuidv7 } from 'uuid';
import { Effect } from 'effect';
import { serializeBurnBlock } from '../db/serializers';
import { warmCache } from '../stacks-api';
import { DbService } from '../effect/layers/db';
import { StreamerService } from '../effect/layers/streamer';

export const handleStacksBlockEvent = (job: WSNewBlockV2) =>
  Effect.gen(function* () {
    const block = job.payload;
    const id = uuidv7({ msecs: new Date(job.receivedAt).getTime() });
    const db = yield* DbService;
    const streamer = yield* StreamerService;
    const dbBlock = {
      ...block,
      id,
      blockTimestamp: block.blockTimestamp
        ? new Date(block.blockTimestamp)
        : new Date(),
      burnBlockTimestamp: block.burnBlockTimestamp
        ? new Date(block.burnBlockTimestamp)
        : new Date(),
      consensusHash: block.consensusHash ?? '',
      indexBlockHash: block.indexBlockHash ?? '',
    } satisfies InferInsertModel<typeof stacksBlocks>;

    yield* Effect.all([
      streamer.publish({
        type: NEW_BLOCK_V2_EVENT,
        networkKey: job.networkKey,
        receivedAt: job.receivedAt,
        payload: {
          ...dbBlock,
          processedAt: job.receivedAt,
          blockTimestamp: dbBlock.blockTimestamp.toISOString(),
          burnBlockTimestamp: dbBlock.burnBlockTimestamp.toISOString(),
        },
      }),
      db.withDb((db) => db.insert(stacksBlocks).values(dbBlock)),
      db.withDb((db) => recentBlocksHealthCache.warmIfNeeded(db)),
    ]);
  });

export const handleBurnBlockEvent = (payload: WSBurnBlockV2) =>
  Effect.gen(function* () {
    // const burnBlock = coreNodeBurnBlockMessageSchema.parse(payload.payload);
    const id = uuidv7({ msecs: new Date(payload.receivedAt).getTime() });
    const dbBurnBlock = {
      id,
      burnBlockHeight: payload.payload.burnBlockHeight,
      burnBlockHash: payload.payload.burnBlockHash,
      networkKey: payload.networkKey,
      consensusHash: payload.payload.consensusHash,
      poxSpendSats: payload.payload.poxSpendSats,
      createdAt: new Date(payload.receivedAt),
    };
    const db = yield* DbService;
    const streamer = yield* StreamerService;
    yield* Effect.all([
      db.withDb((db) => db.insert(burnBlocks).values(dbBurnBlock)),
      streamer.publish({
        type: BURN_BLOCK_V2_EVENT,
        receivedAt: new Date().toISOString(),
        networkKey: payload.networkKey,
        payload: serializeBurnBlock(dbBurnBlock),
      }),
      db.withDb((db) => warmCache(payload.networkKey, db)),
    ]);
  });
