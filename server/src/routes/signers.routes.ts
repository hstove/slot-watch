import { Hono } from 'hono';
import { getPoxInfo, getStackerSet } from '../stacks-api';
import { Schema } from 'effect';
import { describeRoute, resolver, validator } from 'hono-openapi';
import {
  SignersResponseSchema,
  SignerLatenciesResponseSchema,
  StackedNextCycleResponseSchema,
} from 'slot-watch-common';
import { timeout } from 'hono/timeout';
import { log } from '../logger';
import { getSignerLatencies } from '../db/block-responses';
import type { ServerType } from '../server-context';
import { stxCommittedCache } from '../pox-4';

const NetworkKeyParamSchema = Schema.standardSchemaV1(
  Schema.Struct({
    networkKey: Schema.String,
  }).annotations({ identifier: 'NetworkKeyParam' })
);

const signersResponse = Schema.standardSchemaV1(SignersResponseSchema);
const signerLatenciesResponse = Schema.standardSchemaV1(
  SignerLatenciesResponseSchema
);
const stackedNextCycleResponse = Schema.standardSchemaV1(
  StackedNextCycleResponseSchema
);

export const signersRoutes = new Hono<ServerType>()
  .use('*', timeout(5000))
  .get(
    '/signers/:networkKey',
    describeRoute({
      description: 'Get signers for a network',
      responses: {
        200: {
          description: 'Signers and PoX info',
          content: {
            'application/json': { schema: resolver(signersResponse) },
          },
        },
      },
    }),
    validator('param', NetworkKeyParamSchema),
    async (c) => {
      const { networkKey } = c.req.valid('param');
      const poxInfo = await getPoxInfo.get(networkKey);
      const cycle = poxInfo.rewardCycleId;
      const { signers, totalWeight } = await getStackerSet(networkKey, cycle);
      return c.json({
        signers,
        totalWeight,
        ...poxInfo,
      });
    }
  )
  .get(
    '/signers-health-check',
    describeRoute({
      description: 'Health check for signers',
      responses: {
        200: {
          description: 'Health status',
          content: {
            'application/json': {
              schema: resolver(
                Schema.standardSchemaV1(
                  Schema.Struct({ status: Schema.String })
                )
              ),
            },
          },
        },
        500: {
          description: 'Unhealthy status',
          content: {
            'application/json': {
              schema: resolver(
                Schema.standardSchemaV1(
                  Schema.Struct({
                    status: Schema.String,
                    error: Schema.String,
                  })
                )
              ),
            },
          },
        },
      },
    }),
    async (c) => {
      const networkKey = 'mainnet';
      try {
        const poxInfo = await getPoxInfo.get(networkKey);
        const cycle = poxInfo.rewardCycleId;
        const timeoutPromise = new Promise<void>((_, reject) => {
          setTimeout(
            () => reject(new Error('Query timeout after 3000ms')),
            3000
          );
        });
        await Promise.race([timeoutPromise, getStackerSet(networkKey, cycle)]);
        return c.json({
          status: 'healthy',
        });
      } catch (error) {
        log
          .withError(error)
          .withMetadata({
            module: 'signers-health-check',
          })
          .error('Error fetching signers health check');
        process.nextTick(() => {
          process.exit(1);
        });
        return c.json({ status: 'unhealthy', error: String(error) }, 500);
      }
    }
  )
  .get(
    '/signers/:networkKey/signer-latencies',
    describeRoute({
      description: 'Get signer latencies',
      responses: {
        200: {
          description: 'Signer latencies',
          content: {
            'application/json': { schema: resolver(signerLatenciesResponse) },
          },
        },
      },
    }),
    validator('param', NetworkKeyParamSchema),
    async (c) => {
      const { networkKey } = c.req.valid('param');
      const latencies = await getSignerLatencies(networkKey, c.get('db'));
      return c.json({
        latencies: latencies.map((l) => ({
          signerSignatureHash: l.signerSignatureHash,
          latencyMs: Number(l.latencyMs),
        })),
      });
    }
  )
  .get(
    '/signers/:networkKey/stacked-next-cycle',
    describeRoute({
      description: 'Get STX committed for next cycle',
      responses: {
        200: {
          description: 'STX committed per signer',
          content: {
            'application/json': { schema: resolver(stackedNextCycleResponse) },
          },
        },
      },
    }),
    validator('param', NetworkKeyParamSchema),
    async (c) => {
      const { networkKey: _ } = c.req.valid('param');
      const stxCommitted = await stxCommittedCache.get();
      return c.json({
        stxCommitted: Object.entries(stxCommitted).map(([signer, stx]) => ({
          signer,
          stx: stx.toString(),
        })),
      });
    }
  );
