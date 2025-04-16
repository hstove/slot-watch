import { Hono } from 'hono';
import { getPoxInfo, getStackerSet } from '../stacks-api';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { timeout } from 'hono/timeout';
import { logger } from '../logger';
import { db } from '../db/db';
import { stateMachineUpdates } from '../db/schema';
import { eq, desc } from 'drizzle-orm';
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
  });
