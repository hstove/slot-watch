import { Hono } from 'hono';
import { logger } from 'hono/logger';
import eventsRoutes, { getBunServer } from './routes/events.routes';
import { createBunWebSocket } from 'hono/bun';
import { cors } from 'hono/cors';
import type { ServerWebSocket } from 'bun';
import {
  BURN_BLOCKS_EVENT,
  CHUNKS_EVENT,
  MANY_CHUNKS_EVENT,
  NEW_BLOCK_EVENT,
} from 'slot-watch-common';
import { getBlockRoute } from './routes/get-block.routes';
import { getChunksRoutes } from './routes/chunks.routes';
import { prettyJSON } from 'hono/pretty-json';
import { getRecentsRoutes } from './routes/recents.routes';
import { healthRoutes } from './routes/health.routes';
import { metricsRoutes } from './routes/metrics.routes';
import { subClient } from './redis';

type AppWebSocket = ServerWebSocket<{ networkKey: string }>;

const { upgradeWebSocket, websocket } = createBunWebSocket<AppWebSocket>();

export const app = new Hono()
  .use(logger())
  .use(prettyJSON())
  .use(cors())
  .get(
    '/watch',
    upgradeWebSocket((c) => {
      return {
        async onOpen(e, ws) {
          const rawWs = ws.raw as AppWebSocket;
          rawWs.subscribe(CHUNKS_EVENT);
          rawWs.subscribe(BURN_BLOCKS_EVENT);
          rawWs.subscribe(NEW_BLOCK_EVENT);
          rawWs.subscribe(MANY_CHUNKS_EVENT);
        },
        // async message(ws, message) {},
        async onClose(evt, ws) {
          const rawWs = ws.raw as AppWebSocket;
          rawWs.unsubscribe(CHUNKS_EVENT);
          rawWs.unsubscribe(BURN_BLOCKS_EVENT);
          rawWs.unsubscribe(NEW_BLOCK_EVENT);
          rawWs.unsubscribe(MANY_CHUNKS_EVENT);
        },
      };
    }),
  )
  .get(
    '/watch/:networkKey',
    upgradeWebSocket((c) => {
      const networkKey = c.req.param('networkKey');
      return {
        async onOpen(e, ws) {
          const rawWs = ws.raw;
          if (!rawWs) return;
          console.log(`Websocket: opened for ${networkKey}`);
          rawWs.subscribe(networkKey);
        },
        // async message(ws, message) {},
        async onClose(evt, ws) {
          const rawWs = ws.raw;
          if (!rawWs) return;
          console.log(`Websocket: closed for ${networkKey}`);
          rawWs.unsubscribe(networkKey);
        },
      };
    }),
  )

  .get('/', (c) => c.text('Hello World'))

  .route('/', eventsRoutes)

  .route('/', getBlockRoute)
  .route('/', getChunksRoutes)
  .route('/', getRecentsRoutes)
  .route('/health', healthRoutes)
  .route('/', metricsRoutes)

  .notFound((c) => {
    console.log(`${c.req.method} ${c.req.url} not found`);
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
    console.debug('Failed to publish');
  } else if (status === 0) {
  }
}

await subClient.pSubscribe('*', (message, channel) => {
  const status = server.publish(channel, message);
  logSendStatus(status);
});

console.log('Listening on http://localhost:1080');
