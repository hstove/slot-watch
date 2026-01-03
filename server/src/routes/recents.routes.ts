import { Hono } from 'hono';
import { getPoxInfo, getStackerSet } from '../stacks-api';
import {
  getVersionFromString,
  knownSigners,
  percentString,
  type RecentSignersResponse,
  microStxToStx,
  RecentSignersResponseSchema,
  SignersDashboardResponseSchema,
} from 'slot-watch-common';
import { signerDegradationRate, warmupMetrics } from '../metrics';
import { getLatestResponses } from '../db/block-responses';
import type { ServerType } from '../server-context';
import { Schema } from 'effect';
import { describeRoute, resolver, validator } from 'hono-openapi';

const NetworkKeyParamSchema = Schema.standardSchemaV1(
  Schema.Struct({
    networkKey: Schema.String,
  }).annotations({ identifier: 'NetworkKeyParam' })
);

const recentSignersResponse = Schema.standardSchemaV1(
  RecentSignersResponseSchema
);
const signersDashboardResponse = Schema.standardSchemaV1(
  SignersDashboardResponseSchema
);

const getRecentsRoutes = new Hono<ServerType>()
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
  );

export { getRecentsRoutes };
