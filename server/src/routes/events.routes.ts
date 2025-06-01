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
import { logger } from '../logger';
import { handleStackerDBChunk } from '../events/stackerdb';
import { handleBurnBlockEvent } from '../events/block-events';
import { handleStacksBlockEvent } from '../events/block-events';
import { convertBlock } from '../events/block-events';
import { publishWsEventToStreamer } from '../redis';
// import { workerQueue } from '../worker/queue';
// import { convertBlock } from '../events/block-events';

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

const eventsRoutes = new Hono<Env>()
  .onError((err, c) => {
    logger.error(
      { topic: 'event-routes', err, path: c.req.path },
      `Error: ${err}`,
    );

    return c.text('Internal Server Error', 200);
  })

  .get('/auth-test', basicAuthMiddleware, (c) => {
    return c.text(`Hello ${c.get('networkKey')}`, 200);
  })

  .post('/stackerdb_chunks', basicAuthMiddleware, async (c) => {
    const networkKey = c.get('networkKey');
    if (networkKey.startsWith('fnd-') || networkKey.startsWith('hiro-')) {
      return new Response('OK', { status: 200 });
    }
    const data = await c.req.json<StackerDBPayload>();
    const contractId = getPayloadContractId(data);
    console.debug(
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

    // await publishWsEvent(manyChunksPayload);
    await publishWsEventToStreamer(manyChunksPayload);

    c.executionCtx.waitUntil(
      Promise.all([
        handleStackerDBChunk(data, receivedAt, networkKey),
        publishWsEventToStreamer(manyChunksPayload),
        // publishWsEvent(manyChunksPayload),
      ]),
    );
    // workerQueue.add(MANY_CHUNKS_EVENT, {
    //   networkKey,
    //   payload: data,
    //   receivedAt: receivedAt.toISOString(),
    //   type: MANY_CHUNKS_EVENT,
    // });
    // process.nextTick(async () => {
    //   try {
    //     await handleStackerDBChunk(data, receivedAt, networkKey);
    //   } catch (error) {
    //     logger.error(`Error handling stacker db chunk: ${error}`);
    //   }
    // });
    return new Response('OK', { status: 200 });
  })

  .post('/new_block', basicAuthMiddleware, async (c) => {
    const networkKey = c.get('networkKey');
    if (networkKey.startsWith('fnd-') || networkKey.startsWith('hiro-')) {
      return new Response('OK', { status: 200 });
    }
    const data = await c.req.json<CoreNodeBlockMessage>();
    logger.info(`${networkKey}: Got new Block (${data.block_height})`);
    const receivedAt = new Date();
    const sharedPayload: WSNewBlock = {
      type: NEW_BLOCK_EVENT,
      networkKey,
      payload: data,
      receivedAt: receivedAt.toISOString(),
    };
    // publishWsEvent(sharedPayload);
    const block = convertBlock(data);
    // workerQueue.add(NEW_BLOCK_EVENT, {
    //   networkKey,
    //   payload: {
    //     ...block,
    //     networkKey,
    //     receivedAt: receivedAt.toISOString(),
    //     blockTimestamp: block.blockTimestamp?.toISOString() ?? null,
    //     burnBlockTimestamp: block.burnBlockTimestamp.toISOString(),
    //   },
    //   receivedAt: receivedAt.toISOString(),
    //   type: NEW_BLOCK_EVENT,
    // });

    c.executionCtx.waitUntil(
      Promise.all([
        publishWsEventToStreamer(sharedPayload),
        handleStacksBlockEvent({
          type: NEW_BLOCK_EVENT,
          networkKey,
          receivedAt: receivedAt.toISOString(),
          payload: {
            ...block,
            networkKey,
            receivedAt: receivedAt.toISOString(),
            blockTimestamp: block.blockTimestamp?.toISOString() ?? null,
            burnBlockTimestamp: block.burnBlockTimestamp.toISOString(),
          },
        }),
      ]),
    );

    return new Response('OK', { status: 200 });
  })

  .post('/new_burn_block', basicAuthMiddleware, async (c) => {
    const networkKey = c.get('networkKey');
    if (networkKey.startsWith('fnd-') || networkKey.startsWith('hiro-')) {
      return new Response('OK', { status: 200 });
    }
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
    c.executionCtx.waitUntil(
      Promise.all([
        handleBurnBlockEvent(payload),
        publishWsEventToStreamer(payload),
      ]),
    );
    // workerQueue.add(BURN_BLOCKS_EVENT, {
    //   networkKey,
    //   payload: data,
    //   receivedAt: new Date().toISOString(),
    //   type: BURN_BLOCKS_EVENT,
    // });
    // process.nextTick(async () => {
    //   await warmCache(networkKey);
    //   try {
    //     await handleBurnBlockEvent(payload);
    //   } catch (error) {
    //     logger.error(`Error handling burn block event: ${error}`);
    //   }
    // });
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
