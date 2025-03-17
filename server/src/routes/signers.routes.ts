import { Hono } from 'hono';
import { getPoxInfo, getStackerSet } from '../stacks-api';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { timeout } from 'hono/timeout';
import { logger } from '../logger';

export const signersRequestSchema = z.object({
  rewardCycleId: z.coerce.number(),
  networkKey: z.string(),
});

export const signersRoutes = new Hono()
  .use('*', timeout(5000))
  .get(
    '/signers/:networkKey/:rewardCycleId',
    zValidator('param', signersRequestSchema),
    async (c) => {
      const { networkKey, rewardCycleId } = c.req.valid('param');

      const { signers, totalWeight } = await getStackerSet(
        networkKey,
        rewardCycleId,
      );
      return c.json({
        signers,
        totalWeight,
        rewardCycleId,
      });
    },
  )
  .get('/signers/:networkKey', async (c) => {
    const networkKey = c.req.param('networkKey');
    const poxInfo = await getPoxInfo.get(networkKey);
    const cycle = poxInfo.rewardCycleId;
    const { signers, totalWeight } = await getStackerSet(networkKey, cycle);
    return c.json({
      signers,
      totalWeight,
      ...poxInfo,
    });
  })
  .get('/signers-health-check', async (c) => {
    const networkKey = 'mainnet';
    try {
      const poxInfo = await getPoxInfo.get(networkKey);
      const cycle = poxInfo.rewardCycleId;
      const timeoutPromise = new Promise<void>((_, reject) => {
        setTimeout(() => reject(new Error('Query timeout after 3000ms')), 3000);
      });
      await Promise.race([timeoutPromise, getStackerSet(networkKey, cycle)]);
      return c.json({
        status: 'healthy',
      });
    } catch (error) {
      logger.error(
        {
          error: String(error),
          module: 'signers-health-check',
        },
        'Error fetching signers health check',
      );
      process.nextTick(() => {
        process.exit(1);
      });
      return c.json({ status: 'unhealthy', error: String(error) }, 500);
    }
  });
