import { Hono } from 'hono';
import { getPoxInfo, getStackerSet } from '../stacks-api';
import { Schema } from 'effect';
import { describeRoute, resolver, validator } from 'hono-openapi';
import {
  type RecentSignersResponse,
  getVersionFromString,
  knownSigners,
  microStxToStx,
  percentString,
  RecentSignersResponseSchema,
  SignersResponseSchema,
  SignerLatenciesResponseSchema,
  SignersDashboardResponseSchema,
  StackedNextCycleResponseSchema,
} from 'slot-watch-common';
import { timeout } from 'hono/timeout';
import { log } from '../logger';
import { getLatestResponses, getSignerLatencies } from '../db/block-responses';
import type { ServerType } from '../server-context';
import { stxCommittedCache } from '../pox-4';
import { signerDegradationRate, warmupMetrics } from '../metrics';

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

const recentSignersResponse = Schema.standardSchemaV1(
  RecentSignersResponseSchema
);
const signersDashboardResponse = Schema.standardSchemaV1(
  SignersDashboardResponseSchema
);

export const signersRoutes = new Hono<ServerType>()
  .use('*', timeout(5000))
  .get(
    '/signers/:networkKey',
    describeRoute({
      summary: 'Get signers for network',
      description:
        'Get all signers for a network including their weights and PoX info',
      tags: ['Signers'],
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
      summary: 'Signers health check',
      description:
        'Health check endpoint that verifies signers data can be fetched',
      tags: ['Signers'],
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
      summary: 'Get signer latencies',
      description: 'Get response latency statistics for each signer',
      tags: ['Signers'],
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
      summary: 'Get STX committed for next cycle',
      description:
        'Get the amount of STX committed by each signer for the next reward cycle',
      tags: ['Signers'],
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
  )
  .get(
    '/signer-recency/:networkKey',
    describeRoute({
      summary: 'Get signer recency data',
      description:
        'Get recent signer activity including degradation rates and version information',
      tags: ['Signers'],
      responses: {
        200: {
          description: 'Recent signer activity data',
          content: {
            'application/json': { schema: resolver(recentSignersResponse) },
          },
        },
      },
    }),
    validator('param', NetworkKeyParamSchema),
    async (c) => {
      const { networkKey } = c.req.valid('param');
      const { responses, signers, totalWeight, poxInfo } =
        await getLatestResponses(networkKey);
      await warmupMetrics(c.get('db'));
      const cycle = poxInfo.rewardCycleId;

      const signerDegradations = (await signerDegradationRate.get()).values;

      const signerDegradationMap = new Map<string, number>();

      for (const m of signerDegradations) {
        const signerKey = m.labels.signer_key;
        const lastNBlocks = m.labels.last_n_blocks;
        if (
          signerKey &&
          lastNBlocks &&
          typeof lastNBlocks === 'number' &&
          typeof signerKey === 'string'
        ) {
          signerDegradationMap.set(`${signerKey}-${lastNBlocks}`, m.value);
        }
      }

      const signersResponse: RecentSignersResponse['signers'] = signers.map(
        (signer, index) => {
          const response = responses.find(
            (r) => r.signerPublicKey === signer.signing_key
          );
          const percent = signer.weight / totalWeight;

          const version = response?.version ?? '';
          const versionShort = getVersionFromString(version);

          const degradation10 =
            signerDegradationMap.get(`${signer.signing_key}-10`) ?? 0;
          const degradation25 =
            signerDegradationMap.get(`${signer.signing_key}-25`) ?? 0;
          const degradation50 =
            signerDegradationMap.get(`${signer.signing_key}-50`) ?? 0;

          const common = {
            publicKey: signer.signing_key,
            name: knownSigners[signer.signing_key] ?? null,
            slotId: index,
            weight: signer.weight,
            weightPercent: percent,
            weightPercentStr: percentString(percent),
            version,
            versionShort,
            data: null,
            degradation10,
            degradation25,
            degradation50,
            createdAt: response?.createdAt ?? null,
            blockHeight: response?.blockHeight ?? undefined,
          };
          return common;
        }
      );

      const response: RecentSignersResponse = {
        networkKey,
        rewardCycle: cycle,
        totalWeight,
        signers: signersResponse,
      };
      return c.json(response);
    }
  )
  .get(
    '/signers-dashboard/:networkKey',
    describeRoute({
      summary: 'Get signers dashboard data',
      description:
        'Get signer information for dashboard display including stacked amounts and weights',
      tags: ['Signers'],
      responses: {
        200: {
          description: 'Signers dashboard data sorted by weight',
          content: {
            'application/json': { schema: resolver(signersDashboardResponse) },
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

      const signersResponse = signers
        .map((s, i) => {
          const percent = s.weight / totalWeight;
          const percentStr = percentString(percent);
          let label = '';
          const name = knownSigners[s.signing_key];
          if (typeof name === 'undefined') {
            label += `#${i}`;
          } else {
            label += name;
          }
          label += ` (${percentStr}%)`;
          const stx = microStxToStx(s.stacked_amt);

          return {
            publicKey: s.signing_key,
            weight: s.weight,
            weightPercent: percent,
            weightPercentStr: percentStr,
            name: knownSigners[s.signing_key] ?? null,
            stackedAmount: s.stacked_amt,
            stackedAmountStx: stx.toNumber(),
            label,
          };
        })
        .sort((a, b) => b.weight - a.weight);
      return c.json(signersResponse);
    }
  )
  .get('/chunks/signer-latest/:networkKey', async (c) => {
    const networkKey = c.req.param('networkKey');
    const responses = await getLatestResponses(networkKey);
    return c.json(responses);
  });
