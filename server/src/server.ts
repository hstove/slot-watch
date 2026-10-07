import { Hono } from 'hono';
import { requestId } from 'hono/request-id';
import { honoLogger, log } from './logger';
import eventsRoutes from './routes/events.routes';
import { cors } from 'hono/cors';
import { blockRoutes } from './routes/blocks.routes';
import { prettyJSON } from 'hono/pretty-json';
import { healthRoutes } from './routes/health.routes';
import { signersRoutes } from './routes/signers.routes';
import { stateMachineRoutes } from './routes/state-machine.routes';
import { minersRoutes } from './routes/miners.routes';
import { minerEconomicsRoutes } from './routes/miner-economics.routes';
import { pricesRoutes } from './routes/prices.routes';
import { makeDb } from './db/db';
import type { ServerType } from './server-context';
import { openAPIRouteHandler } from 'hono-openapi';
import { Scalar } from '@scalar/hono-api-reference';
import { warmupMetrics } from './metrics';
import { register, Registry } from 'prom-client';
import { makeMcpServer } from './mcp/mcp';
import { StreamableHTTPTransport } from '@hono/mcp';
import { Effect } from 'effect';
import { FetchHttpClient } from 'effect/unstable/http';
import { startOfHour, HOUR_MS } from './prices/coinbase';
import { syncHourlyPrices } from './prices/sync';
import { env } from 'cloudflare:workers';

// The Durable Object class must be exported from the Worker's entrypoint.
// biome-ignore lint/performance/noBarrelFile: required by the Workers runtime
export { MinerCommitsWatcher } from './miner-commits/durable-object';

/** The single watcher instance; any request also (re)starts it. */
function minerCommitsWatcher() {
  return env.MINER_COMMITS.get(env.MINER_COMMITS.idFromName('mainnet'));
}

const api = new Hono<ServerType>()
  .route('/', blockRoutes)
  .route('/', signersRoutes)
  .route('/', stateMachineRoutes)
  .route('/', minersRoutes)
  .route('/', minerEconomicsRoutes)
  .route('/', pricesRoutes)
  .route('/health', healthRoutes);

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
        servers: [
          { url: 'https://api.slotwatch.dev', description: 'Slot Watch API' },
        ],
        tags: [
          { name: 'Burn Blocks', description: 'Bitcoin burn block operations' },
          {
            name: 'Stacks Blocks',
            description: 'Stacks block proposals and responses',
          },
          { name: 'Signers', description: 'Signer information and statistics' },
          {
            name: 'State Machines',
            description: 'Signer state machine updates',
          },
          { name: 'Miners', description: 'Miner statistics and activity' },
          {
            name: 'Miner Economics',
            description:
              'Miner BTC spend and matured STX revenue per burn block',
          },
          { name: 'Market Prices', description: 'Hourly market candle opens' },
        ],
      },
    })
  )

  .route('/', eventsRoutes)
  .route('/', api)

  .get('/docs', Scalar({ url: '/openapi.json' }))

  .get('/miner-commits/status', async () => {
    const response = await minerCommitsWatcher().fetch(
      'https://miner-commits/status'
    );
    return new Response(response.body, response);
  })

  .get('/metrics', async (c) => {
    await warmupMetrics(c.get('db'));
    // @ts-expect-error
    register.setContentType(Registry.OPENMETRICS_CONTENT_TYPE);
    const metrics = await register.metrics();
    return c.text(metrics, 200);
  })

  .all('/mcp', async (c) => {
    const transport = new StreamableHTTPTransport({});
    const mcp = makeMcpServer();
    await mcp.connect(transport);
    return transport.handleRequest(c);
  })

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

/** @alias */
export default {
  fetch: app.fetch,
  async scheduled(controller: ScheduledController) {
    // Backstop for the watcher's own alarm; separate so it can't fail prices.
    try {
      await minerCommitsWatcher().fetch('https://miner-commits/status');
    } catch (error) {
      log.withError(error).error('Failed to ping miner commits watcher');
    }
    const to = new Date(
      startOfHour(new Date(controller.scheduledTime)).getTime() + HOUR_MS
    );
    const from = new Date(to.getTime() - 6 * HOUR_MS);
    const db = makeDb();
    await db.$client.connect();
    try {
      const counts = await Effect.runPromise(
        syncHourlyPrices(db, from, to).pipe(
          Effect.provide(FetchHttpClient.layer)
        )
      );
      log
        .withMetadata({
          topic: 'hourly-prices',
          from: from.toISOString(),
          to: to.toISOString(),
          counts,
        })
        .info('Refreshed hourly prices');
    } catch (error) {
      log.withError(error).error('Failed to refresh hourly prices');
      throw error;
    } finally {
      await db.$client.end();
    }
  },
};
