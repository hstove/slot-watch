import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { db } from '../db/db';
import { stateMachineUpdates } from '../db/schema';
import { eq, desc, inArray } from 'drizzle-orm';
import { serializeStateMachineUpdate } from '../db/state-machines';

export const stateMachineRoutes = new Hono()
  // .use('*', timeout(5000))
  .get(':networkKey/state-machines', async (c) => {
    const networkKey = c.req.param('networkKey');
    // const poxInfo = await getPoxInfo.get(networkKey);
    // const { signers } = await getStackerSet(networkKey, poxInfo.rewardCycleId);
    const latestStateMachineUpdatesDistinct = await db
      // .selectDistinctOn([stateMachineUpdates.signerPublicKey])
      .selectDistinct({
        signerPublicKey: stateMachineUpdates.signerPublicKey,
        id: stateMachineUpdates.id,
      })
      .from(stateMachineUpdates)
      .where(eq(stateMachineUpdates.networkKey, networkKey))
      .orderBy(
        stateMachineUpdates.signerPublicKey,
        desc(stateMachineUpdates.id),
      );
    const latestStateMachineUpdates = await db
      .select()
      .from(stateMachineUpdates)
      .where(
        inArray(
          stateMachineUpdates.id,
          latestStateMachineUpdatesDistinct.map((u) => u.id),
        ),
      )
      .orderBy(desc(stateMachineUpdates.id));
    const latestUpdates = latestStateMachineUpdates.map((update) => {
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
