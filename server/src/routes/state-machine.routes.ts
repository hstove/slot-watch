import { Hono } from 'hono';
import { getPoxInfo, getStackerSet } from '../stacks-api';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { timeout } from 'hono/timeout';
import { logger } from '../logger';
import { db } from '../db/db';
import { stateMachineUpdates } from '../db/schema';
import { eq, desc, gte, and } from 'drizzle-orm';
import {
  superDeserialize,
  superSerialize,
  type ApiStateMachineUpdate,
  type SuperJSON,
} from 'slot-watch-common';
import { serializeStateMachineUpdate } from '../db/state-machines';

export const stateMachineRoutes = new Hono()
  // .use('*', timeout(5000))
  .get(':networkKey/state-machines', async (c) => {
    const networkKey = c.req.param('networkKey');
    // const poxInfo = await getPoxInfo.get(networkKey);
    // const { signers } = await getStackerSet(networkKey, poxInfo.rewardCycleId);
    const latestStateMachineUpdates = await db
      .selectDistinctOn([stateMachineUpdates.signerPublicKey])
      .from(stateMachineUpdates)
      .where(eq(stateMachineUpdates.networkKey, networkKey))
      .orderBy(
        stateMachineUpdates.signerPublicKey,
        desc(stateMachineUpdates.createdAt),
      );
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
        cursor: z.coerce.number().optional(),
      }),
    ),
    async (c) => {
      const cursor = c.req.query('cursor');
      const cursorDate = cursor ? new Date(cursor) : undefined;
      const stateMachines = await db.query.stateMachineUpdates.findMany({
        where({ networkKey, createdAt }, { and, gte, eq }) {
          return and(
            eq(networkKey, networkKey),
            cursorDate ? gte(createdAt, cursorDate) : undefined,
          );
        },
        orderBy({ createdAt }, { desc }) {
          return desc(createdAt);
        },
        limit: 200,
      });
      const lastCreatedAt = stateMachines.at(-1)?.createdAt;
      return c.json({
        stateMachines: stateMachines.map(serializeStateMachineUpdate),
        lastCreatedAt: lastCreatedAt?.getTime(),
      });
    },
  );
