import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { db } from '../db/db';
import { stateMachineUpdates, type StateMachineUpdateDb } from '../db/schema';
import { eq, desc, inArray, sql } from 'drizzle-orm';
import { serializeStateMachineUpdate } from '../db/state-machines';
import * as R from 'remeda';

export const stateMachineRoutes = new Hono()
  // .use('*', timeout(5000))
  .get(':networkKey/state-machines', async (c) => {
    const networkKey = c.req.param('networkKey');
    const latestStateMachineUpdatesDistinct = await db
      .select()
      .from(stateMachineUpdates)
      .where(eq(stateMachineUpdates.networkKey, networkKey))
      .orderBy(desc(stateMachineUpdates.id))
      .limit(1000);
    const bySignerKey = R.groupBy(
      latestStateMachineUpdatesDistinct,
      R.prop('signerPublicKey'),
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
  })
  .get(
    '/:networkKey/state-machine-updates',
    zValidator(
      'query',
      z.object({
        cursor: z.string().optional(),
      }),
    ),
    async (c) => {
      const networkKeyParam = c.req.param('networkKey');
      const { cursor } = c.req.valid('query');
      const stateMachines = await db.query.stateMachineUpdates.findMany({
        where({ networkKey, id }, { and, eq, lt }) {
          return and(
            eq(networkKey, networkKeyParam),
            cursor ? lt(id, cursor) : undefined,
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
    },
  );
