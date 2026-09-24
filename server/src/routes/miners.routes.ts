import { Hono } from 'hono';
import { Schema } from 'effect';
import { describeRoute, resolver, validator } from 'hono-openapi';
import {
  MinersResponseSchema,
  MinerDetailResponseSchema,
  NetworkKeyParamSchema,
  NetworkKeySchema,
} from 'slot-watch-common';
import { timeout } from 'hono/timeout';
import type { ServerType } from '../server-context';
import { fetchRecentMinerStats, fetchMinerDetail } from '../db/block-proposals';

const MinerDetailParamSchema = Schema.toStandardSchemaV1(
  Schema.Struct({
    networkKey: NetworkKeySchema,
    publicKey: Schema.String,
  }).annotate({ identifier: 'MinerDetailParam' })
);

const minersResponse = Schema.toStandardSchemaV1(MinersResponseSchema);
const minerDetailResponse = Schema.toStandardSchemaV1(
  MinerDetailResponseSchema
);

export const minersRoutes = new Hono<ServerType>()
  .use('*', timeout(5000))
  .get(
    '/:networkKey/miners',
    describeRoute({
      summary: 'Get miner statistics',
      description: 'Get recent mining statistics for all active miners',
      tags: ['Miners'],
      responses: {
        200: {
          description: 'Miner statistics',
          content: {
            'application/json': { schema: resolver(minersResponse) },
          },
        },
      },
    }),
    validator('param', Schema.toStandardSchemaV1(NetworkKeyParamSchema)),
    async (c) => {
      const { networkKey } = c.req.valid('param');
      const minerStats = await fetchRecentMinerStats(networkKey, c.get('db'));
      return c.json({
        minerStats,
      });
    }
  )
  .get(
    '/:networkKey/miners/:publicKey',
    describeRoute({
      summary: 'Get miner detail',
      description:
        'Get detailed information for a specific miner including stats, version history, and recent blocks',
      tags: ['Miners'],
      responses: {
        200: {
          description: 'Miner detail',
          content: {
            'application/json': { schema: resolver(minerDetailResponse) },
          },
        },
        404: {
          description: 'Miner not found',
          content: {
            'application/json': {
              schema: resolver(
                Schema.toStandardSchemaV1(
                  Schema.Struct({ error: Schema.String })
                )
              ),
            },
          },
        },
      },
    }),
    validator('param', MinerDetailParamSchema),
    async (c) => {
      const { networkKey, publicKey } = c.req.valid('param');
      const minerDetail = await fetchMinerDetail(
        networkKey,
        publicKey,
        c.get('db')
      );
      if (!minerDetail) {
        return c.json({ error: 'Miner not found' }, 404);
      }
      return c.json(minerDetail);
    }
  );
