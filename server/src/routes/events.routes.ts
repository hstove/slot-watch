import type { Server } from 'bun';
import { createMiddleware } from 'hono/factory';
import { Hono, type Context } from 'hono';
import { getPayloadContractId } from '../utils';
import {
  BURN_BLOCKS_EVENT,
  type StackerDBPayload,
  type ChunkEvent,
  type WSNewBlock,
  type CoreNodeBlockMessage,
  NEW_BLOCK_EVENT,
  type CoreNodeBurnBlockMessage,
  type WSBurnBlock,
  MANY_CHUNKS_EVENT,
  type WSManyChunks,
  type WSPayload,
} from 'slot-watch-common';
import { getNetworkKeyHono } from '../auth';
import { handleStackerDBChunk } from '../events/stackerdb';
import { warmCache } from '../stacks-api';
import { redisClient } from '../redis';
import { logger } from '../logger';
import {
  handleBurnBlockEvent,
  handleStacksBlockEvent,
} from '../events/block-events';

export const getBunServer = (c: Context): Server => {
  const server = ('server' in c.env ? c.env.server : c.env) as
    | Server
    | undefined;
  if (!server) {
    throw new Error('Server not found');
  }
  return server;
};

type Env = {
  Variables: {
    networkKey: string;
  };
};

const basicAuthMiddleware = createMiddleware<Env>(async (c, next) => {
  const networkKey = getNetworkKeyHono(c.req);
  if (!networkKey) {
    // return new Response("Unauthorized", { status: 200 });
    return c.text('Unauthorized', 200);
  }
  c.set('networkKey', networkKey);
  await next();
});

function publishEvent(networkKey: string, payload: WSPayload) {
  process.nextTick(async () => {
    try {
      logger.trace(
        { topic: 'redis', payloadType: payload.type },
        'Publishing event',
      );
      await redisClient.publish(networkKey, JSON.stringify(payload));
    } catch (error) {
      logger.error({ topic: 'redis' }, `Error publishing event: ${error}`);
    }
  });
}

const eventsRoutes = new Hono<Env>()

  .get('/auth-test', basicAuthMiddleware, (c) => {
    return c.text(`Hello ${c.get('networkKey')}`, 200);
  })

  .post('/stackerdb_chunks', basicAuthMiddleware, async (c) => {
    const server = getBunServer(c);
    const networkKey = c.get('networkKey');
    const data = await c.req.json<StackerDBPayload>();
    const contractId = getPayloadContractId(data);
    logger.debug(
      `${networkKey}: Got ${data.modified_slots.length} updates for ${contractId}`,
    );
    const receivedAt = new Date();
    const chunks: ChunkEvent[] = [];
    for (const chunk of data.modified_slots) {
      chunks.push({
        slotId: chunk.slot_id,
        version: chunk.slot_version,
        contractId,
        signature: chunk.sig,
        data: chunk.data,
        createdAt: receivedAt.toISOString(),
      });
    }
    const manyChunksPayload: WSManyChunks = {
      type: MANY_CHUNKS_EVENT,
      networkKey,
      payload: chunks,
      receivedAt: receivedAt.toISOString(),
    };
    publishEvent(networkKey, manyChunksPayload);
    process.nextTick(async () => {
      try {
        await handleStackerDBChunk(data, receivedAt, networkKey);
      } catch (error) {
        logger.error(`Error handling stacker db chunk: ${error}`);
      }
    });
    return new Response('OK', { status: 200 });
  })

  .post('/new_block', basicAuthMiddleware, async (c) => {
    const server = getBunServer(c);
    const networkKey = c.get('networkKey');
    const data = await c.req.json<CoreNodeBlockMessage>();
    logger.info(`${networkKey}: Got new Block (${data.block_height})`);
    const receivedAt = new Date();
    const sharedPayload: WSNewBlock = {
      type: NEW_BLOCK_EVENT,
      networkKey,
      payload: data,
      receivedAt: receivedAt.toISOString(),
    };
    publishEvent(networkKey, sharedPayload);

    process.nextTick(async () => {
      try {
        await handleStacksBlockEvent(sharedPayload);
      } catch (error) {
        logger.error(`Error handling stacks block event: ${error}`);
      }
    });

    return new Response('OK', { status: 200 });
  })

  .post('/new_burn_block', basicAuthMiddleware, async (c) => {
    const server = getBunServer(c);
    const networkKey = c.get('networkKey');
    const data = await c.req.json<CoreNodeBurnBlockMessage>();
    logger.info(
      `${networkKey}: Got new Burn Block (${data.burn_block_height})`,
    );
    const payload: WSBurnBlock = {
      type: BURN_BLOCKS_EVENT,
      receivedAt: new Date().toISOString(),
      networkKey,
      payload: data,
    };
    publishEvent(networkKey, payload);
    process.nextTick(async () => {
      await warmCache(networkKey);
      try {
        await handleBurnBlockEvent(payload);
      } catch (error) {
        logger.error(`Error handling burn block event: ${error}`);
      }
    });
    return new Response('OK', { status: 200 });
  })

  .post('/proposal_response', basicAuthMiddleware, async (c) => {
    const networkKey = c.get('networkKey');
    logger.debug(
      {
        response: await c.req.json(),
      },
      `${networkKey}: Got proposal response`,
    );
    return new Response('OK', { status: 200 });
  });

export default eventsRoutes;
