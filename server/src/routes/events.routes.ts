import { createMiddleware } from 'hono/factory';
import { Hono } from 'hono';
import { getPayloadContractId } from '../utils';
import {
  type StackerDBPayload,
  type CoreNodeBlockMessage,
  type CoreNodeBurnBlockMessage,
  type WSBurnBlockV2,
  BURN_BLOCK_V2_EVENT,
  coreNodeBurnBlockMessageSchema,
  NEW_BLOCK_V2_EVENT,
} from 'slot-watch-common';
import { getNetworkKeyFromRequest } from '../auth';
import { log, logger } from '../logger';
import { handleStackerDBChunk } from '../events/stackerdb';
import {
  handleBurnBlockEvent,
  handleStacksBlockEvent,
} from '../events/block-events';
import { convertBlock } from '../events/convert-block';
import type { ServerContext } from '../server-context';
import { runEffect } from '../effect/runtime';

// biome-ignore lint/style/useConsistentTypeDefinitions: ignored using `--suppress`
type Env = {
  Variables: {
    networkKey: string;
  } & ServerContext;
};

const basicAuthMiddleware = createMiddleware<Env>(async (c, next) => {
  const networkKey = getNetworkKeyFromRequest(c.req);
  if (!networkKey) {
    // return new Response("Unauthorized", { status: 200 });
    return c.text('Unauthorized', 200);
  }
  c.set('networkKey', networkKey);
  await next();
});

const eventsRoutes = new Hono<Env>()
  .onError((err, c) => {
    log
      .withMetadata({
        topic: 'event-routes',
        path: c.req.path,
        errorName: err.name,
        errorMessage: err.message,
      })
      .error(`Error in event routes: ${err.name}: ${err.message}`);

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
    log
      .withMetadata({
        networkKey,
        contractId,
        numSlots: data.modified_slots.length,
      })
      .debug(`Got ${data.modified_slots.length} stackerdb chunks`);
    const receivedAt = new Date();
    c.executionCtx.waitUntil(
      runEffect(
        handleStackerDBChunk({
          payload: data,
          receivedAt,
          networkKey,
        })
      )
    );
    logger.info('Sending response for stackerdb event.');
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
    const block = convertBlock(data);

    c.executionCtx.waitUntil(
      runEffect(
        handleStacksBlockEvent({
          type: NEW_BLOCK_V2_EVENT,
          networkKey,
          receivedAt: receivedAt.toISOString(),
          payload: {
            ...block,
            networkKey,
            processedAt: receivedAt.toISOString(),
            blockTimestamp: block.blockTimestamp?.toISOString() ?? null,
            burnBlockTimestamp: block.burnBlockTimestamp.toISOString(),
          },
        })
      )
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
      `${networkKey}: Got new Burn Block (${data.burn_block_height})`
    );
    const burnBlock = coreNodeBurnBlockMessageSchema.parse(data);
    const payload: WSBurnBlockV2 = {
      type: BURN_BLOCK_V2_EVENT,
      receivedAt: new Date().toISOString(),
      networkKey,
      payload: {
        ...burnBlock,
        networkKey,
        createdAt: new Date().toISOString(),
        burnBlockHeight: burnBlock.burn_block_height,
        burnBlockHash: burnBlock.burn_block_hash,
        consensusHash: burnBlock.consensus_hash,
      },
    };
    c.executionCtx.waitUntil(runEffect(handleBurnBlockEvent(payload)));
    return new Response('OK', { status: 200 });
  })

  .post('/proposal_response', basicAuthMiddleware, async (c) => {
    const networkKey = c.get('networkKey');
    logger.debug(
      {
        response: await c.req.json(),
      },
      `${networkKey}: Got proposal response`
    );
    return new Response('OK', { status: 200 });
  });

export default eventsRoutes;
