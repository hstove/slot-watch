import { Hono } from 'hono';
import { getRecentBlocksHealth } from '../db/block-proposals';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { getCreatedAt } from '../utils';

export const healthRoutes = new Hono().get(
  '/recent-blocks/:networkKey',
  zValidator(
    'query',
    z.object({
      from: z.coerce.number().optional(),
      to: z.coerce.number().optional(),
    }),
  ),
  async (c) => {
    const networkKey = c.req.param('networkKey');
    const { from, to } = c.req.valid('query');
    const health = await getRecentBlocksHealth({ networkKey, from, to });
    const blocks = health.blocks.map((b) => {
      const createdAt = getCreatedAt(b.id);
      return {
        ...b,
        createdAt: createdAt.toISOString(),
        pushedAt: b.pushedAt?.toISOString() ?? null,
      };
    });
    return c.json({
      ...health,
      blocks,
    });
  },
);
