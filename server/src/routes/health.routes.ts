import { Hono } from 'hono';
import { getRecentBlocksHealth } from '../db/block-proposals';

export const healthRoutes = new Hono().get(
  '/recent-blocks/:networkKey',
  async (c) => {
    const networkKey = c.req.param('networkKey');
    const health = await getRecentBlocksHealth(networkKey);
    const blocks = health.blocks.map((b) => {
      return {
        ...b,
        createdAt: b.createdAt.toISOString(),
        pushedAt: b.pushedAt?.toISOString() ?? null,
      };
    });
    return c.json({
      ...health,
      blocks,
    });
  },
);
