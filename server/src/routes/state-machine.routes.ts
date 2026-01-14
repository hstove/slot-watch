import { Hono } from 'hono';
import { Schema } from 'effect';
import { describeRoute, resolver, validator } from 'hono-openapi';
import { stateMachineUpdates, type StateMachineUpdateDb } from '../db/schema';
import { eq, desc } from 'drizzle-orm';
import { serializeStateMachineUpdate } from '../db/serializers';
import * as R from 'remeda';
import type { ServerType } from '../server-context';
import {
  StateMachinesResponseSchema,
  StateMachineUpdatesResponseSchema,
} from 'slot-watch-common';

const NetworkKeyParamSchema = Schema.standardSchemaV1(
  Schema.Struct({
    networkKey: Schema.String,
  }).annotations({ identifier: 'NetworkKeyParam' })
);

const StateMachineUpdatesQuerySchema = Schema.standardSchemaV1(
  Schema.Struct({
    cursor: Schema.optional(Schema.String),
  }).annotations({ identifier: 'StateMachineUpdatesQuery' })
);

const stateMachinesResponse = Schema.standardSchemaV1(
  StateMachinesResponseSchema
);
const stateMachineUpdatesResponse = Schema.standardSchemaV1(
  StateMachineUpdatesResponseSchema
);

export const stateMachineRoutes = new Hono<ServerType>()
  .get(
    ':networkKey/state-machines',
    describeRoute({
      summary: 'Get latest state machines',
      description:
        'Get the latest state machine update for each signer in the network',
      tags: ['State Machines'],
      responses: {
        200: {
          description: 'Latest state machine updates per signer',
          content: {
            'application/json': { schema: resolver(stateMachinesResponse) },
          },
        },
      },
    }),
    validator('param', NetworkKeyParamSchema),
    async (c) => {
      const { networkKey } = c.req.valid('param');
      const latestStateMachineUpdatesDistinct = await c
        .get('db')
        .select()
        .from(stateMachineUpdates)
        .where(eq(stateMachineUpdates.networkKey, networkKey))
        .orderBy(desc(stateMachineUpdates.id))
        .limit(1000);
      const bySignerKey = R.groupBy(
        latestStateMachineUpdatesDistinct,
        R.prop('signerPublicKey')
      );

      const stateMachines: StateMachineUpdateDb[] = [];
      for (const signerKey of Object.keys(bySignerKey)) {
        const updates = bySignerKey[signerKey];
        const latestUpdate = updates?.[0];
        if (latestUpdate) {
          stateMachines.push(latestUpdate);
        }
      }

      const latestUpdates = stateMachines.map((update) => {
        return serializeStateMachineUpdate(update);
      });
      const response = {
        latestStateMachineUpdates: latestUpdates,
      };
      return c.json(response);
    }
  )
  .get(
    '/:networkKey/state-machine-updates',
    describeRoute({
      summary: 'Get paginated state machine updates',
      description:
        'Get state machine updates with cursor-based pagination for historical analysis',
      tags: ['State Machines'],
      responses: {
        200: {
          description: 'Paginated state machine updates',
          content: {
            'application/json': {
              schema: resolver(stateMachineUpdatesResponse),
            },
          },
        },
      },
    }),
    validator('param', NetworkKeyParamSchema),
    validator('query', StateMachineUpdatesQuerySchema),
    async (c) => {
      const { networkKey: networkKeyParam } = c.req.valid('param');
      const { cursor } = c.req.valid('query');
      const stateMachines = await c
        .get('db')
        .query.stateMachineUpdates.findMany({
          where({ networkKey, id }, { and, eq, lt }) {
            return and(
              eq(networkKey, networkKeyParam),
              cursor ? lt(id, cursor) : undefined
            );
          },
          orderBy({ id }, { desc }) {
            return desc(id);
          },
          limit: 200,
        });
      const lastId = stateMachines.at(-1)?.id;
      return c.json({
        lastId,
        next: `/${networkKeyParam}/state-machine-updates?cursor=${lastId}`,
        stateMachines: stateMachines.map(serializeStateMachineUpdate),
      });
    }
  );
