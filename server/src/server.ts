import { Hono } from 'hono';
import { requestId } from 'hono/request-id';
import { honoLogger, log } from './logger';
import eventsRoutes from './routes/events.routes';
import { cors } from 'hono/cors';
import { blockRoutes } from './routes/blocks.routes';
import { getChunksRoutes } from './routes/chunks.routes';
import { prettyJSON } from 'hono/pretty-json';
import { getRecentsRoutes } from './routes/recents.routes';
import { healthRoutes } from './routes/health.routes';
import { metricsRoutes } from './routes/metrics.routes';
import { signersRoutes } from './routes/signers.routes';
import { stateMachineRoutes } from './routes/state-machine.routes';
import { makeDb } from './db/db';
import type { ServerType } from './server-context';
import { openAPIRouteHandler } from 'hono-openapi';

const api = new Hono<ServerType>()
  .route('/', blockRoutes)
  .route('/', getChunksRoutes)
  .route('/', getRecentsRoutes)
  .route('/', signersRoutes)
  .route('/', stateMachineRoutes)
  .route('/health', healthRoutes)
  .route('/', metricsRoutes);

export const app = new Hono<ServerType>()
  .use(async (c, next) => {
    const db = makeDb();
    await db.$client.connect();
    c.set('db', db);
    await next();
    await db.$client.end();
  })
  .use('*', requestId())
  .use(honoLogger)
  .use(prettyJSON())
  .use(cors())

  .get('/', (c) => c.text('Hello World'))

  .get(
    '/openapi.json',
    openAPIRouteHandler(api, {
      documentation: {
        info: {
          title: 'SlotWatch API',
          version: '1.0.0',
          description:
            'API for monitoring Stacks blockchain signers and blocks',
        },
      },
    })
  )

  .route('/', eventsRoutes)
  .route('/', api)

  // .route('/', workerRoutes)
  .onError((err, c) => {
    console.error(err, 'Error handling request');
    log
      .withError(err)
      .withMetadata({
        path: c.req.path,
      })
      .error('Error handling request');
    return c.text(`Internal Server Error: ${err.message}`, 500);
  })

  .notFound((c) => {
    log.debug(`${c.req.method} ${c.req.url} not found`);
    return c.text('Not Found', 200);
  });

export type SlotWatchServer = typeof app;

export default app;
