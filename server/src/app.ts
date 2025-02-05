import { Hono } from 'hono';
import { requestId } from 'hono/request-id';
import { logger, honoLogger } from './logger';
import eventsRoutes from './routes/events.routes';
import { createBunWebSocket } from 'hono/bun';
import { cors } from 'hono/cors';
import type { ServerWebSocket } from 'bun';
import {
  BURN_BLOCKS_EVENT,
  CHUNKS_EVENT,
  MANY_CHUNKS_EVENT,
  NEW_BLOCK_EVENT,
} from 'slot-watch-common';
import { blockRoutes } from './routes/blocks.routes';
import { getChunksRoutes } from './routes/chunks.routes';
import { prettyJSON } from 'hono/pretty-json';
import { getRecentsRoutes } from './routes/recents.routes';
import { healthRoutes } from './routes/health.routes';
import { metricsRoutes } from './routes/metrics.routes';
import { subClient } from './redis';
import { signersRoutes } from './routes/signers.routes';
import { streamRoutes } from './routes/stream.routes';
import workerRoutes from './routes/worker.routes';

type AppWebSocket = ServerWebSocket<{ networkKey: string }>;

const { upgradeWebSocket, websocket } = createBunWebSocket<AppWebSocket>();

export const app = new Hono()
  .use('*', requestId())
  .use(honoLogger)
  .use(prettyJSON())
  .use(cors())
  .get(
    '/watch/:networkKey',
    upgradeWebSocket((c) => {
      const networkKey = c.req.param('networkKey');
      return {
        async onOpen(e, ws) {
          const rawWs = ws.raw;
          if (!rawWs) return;
          logger.info(`Websocket: opened for ${networkKey}`);
          rawWs.subscribe(networkKey);
        },
        // async message(ws, message) {},
        async onClose(evt, ws) {
          const rawWs = ws.raw;
          if (!rawWs) return;
          logger.info(`Websocket: closed for ${networkKey}`);
          rawWs.unsubscribe(networkKey);
        },
      };
    }),
  )

  .get('/', (c) => c.text('Hello World'))

  .route('/', eventsRoutes)

  .route('/', blockRoutes)
  .route('/', getChunksRoutes)
  .route('/', getRecentsRoutes)
  .route('/', signersRoutes)
  .route('/health', healthRoutes)
  .route('/', metricsRoutes)
  .route('/', streamRoutes)
  .route('/', workerRoutes)
  .onError((err, c) => {
    if (err instanceof Error) {
      logger.error({
        err,
        stack: err.stack,
        message: err.message,
      });
    } else {
      logger.error({
        err,
      });
    }
    return c.text('Internal Server Error', 500);
  })

  .notFound((c) => {
    logger.debug(`${c.req.method} ${c.req.url} not found`);
    return c.text('Not Found', 200);
  });

export type SlotWatchServer = typeof app;

// export default {
// 	port: 1080,
// 	fetch: app.fetch,
// 	websocket: {
// 		...websocket,
// 		backpressureLimit: 1024 * 1024 * 5, // 5MB
// 	},
// };

const server = Bun.serve({
  port: 1080,
  fetch: app.fetch,
  idleTimeout: 60,
  websocket: {
    ...websocket,
    backpressureLimit: 1024 * 1024 * 5, // 5MB
    message(ws, message) {
      if (message === 'ping') {
        ws.send('pong');
        return;
      }
      if (typeof message !== 'string') return;
      try {
        const payload = JSON.parse(message);
        if (payload.type === 'subscribe') {
          const networkKey = payload.networkKey;
          if (networkKey) {
            ws.subscribe(networkKey);
          }
        }
      } catch (error) {}
    },
  },
});

function logSendStatus(status: number) {
  if (status === -1) {
    // console.debug('Failed to publish');
    logger.warn('Failed to publish to websocket');
  } else if (status === 0) {
  }
}

await subClient.psubscribe('*', (error, count) => {
  if (error) {
    logger.error(
      { err: error, topic: 'redis' },
      'Failed to subscribe to redis',
    );
  } else {
    logger.debug({ topic: 'redis' }, `Subscribed to ${count} channels`);
  }
  // const status = server.publish(channel as string, message as string);
  // logSendStatus(status);
});

subClient.on('pmessage', (pattern, channel, message) => {
  logger.trace(
    {
      channel,
      message,
      topic: 'redis',
    },
    'Received redis pubsub message',
  );
  const status = server.publish(channel, message);
  logSendStatus(status);
});

logger.info(`Listening on http://localhost:${server.port}`);
