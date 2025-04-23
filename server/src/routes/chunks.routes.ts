import { Hono } from 'hono';
import { db } from '../db/db';
import { desc, eq, inArray, and, gte, lte, asc } from 'drizzle-orm';
import { stackerDbSlots } from '../db/schema';
import type {
  ChunkEventParsed,
  TimelineChunk,
  TimelineResponse,
} from 'slot-watch-common';
import * as P from 'micro-packed';
import { serializeDbChunk } from '../utils';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { getLatestResponses } from '../db/block-responses';

const getChunksRoutes = new Hono()

  .get(
    '/chunks/timeline',
    zValidator('query', z.object({ networkKeys: z.string() })),
    async (c) => {
      const networkKeys = c.req.valid('query').networkKeys.split(',');

      const [first, ...otherNetworks] = networkKeys;
      if (!first) {
        throw new Error('No network key provided');
      }

      const firstChunks = await db
        .select()
        .from(stackerDbSlots)
        .where(eq(stackerDbSlots.networkKey, first))
        .orderBy(desc(stackerDbSlots.createdAt))
        .limit(200);

      const otherChunks = await db
        .select()
        .from(stackerDbSlots)
        .where(inArray(stackerDbSlots.networkKey, otherNetworks))
        .orderBy(desc(stackerDbSlots.createdAt))
        .limit(400);

      const groupedChunks: TimelineChunk[] = firstChunks.map((chunk) => {
        const othersFound = Object.fromEntries(
          otherNetworks.map((networkKey) => {
            const found = otherChunks.find((otherChunk) => {
              return (
                P.utils.equalBytes(chunk.data, otherChunk.data) &&
                otherChunk.networkKey === networkKey &&
                otherChunk.version === chunk.version &&
                otherChunk.slotId === chunk.slotId
              );
            });

            if (typeof found === 'undefined') {
              return [networkKey, null];
            }

            const diffSeconds =
              (found.createdAt.getTime() - chunk.createdAt.getTime()) / 1000;

            return [
              networkKey,
              { createdAt: found.createdAt.toISOString(), diffSeconds },
            ];
          }),
        );

        const chunkEvent = serializeDbChunk(chunk);

        return {
          ...chunkEvent,
          others: othersFound,
        };
      });

      return c.json<TimelineResponse>({
        chunks: groupedChunks,
      });
    },
  )

  .get(
    '/chunks/:networkKey/:from/:to',
    zValidator(
      'param',
      z.object({
        networkKey: z.string(),
        from: z.coerce.number().int().positive(),
        to: z.coerce.number().int().positive(),
      }),
    ),
    async (c) => {
      const networkKey = c.req.valid('param').networkKey;
      function getDate(key: 'from' | 'to') {
        const param = c.req.valid('param')[key];
        return new Date(param);
      }
      const from = getDate('from');
      const to = getDate('to');

      const chunks = await db
        .select()
        .from(stackerDbSlots)
        .where(
          and(
            eq(stackerDbSlots.networkKey, networkKey),
            // gte(stackerDbSlots.createdAt, from),
            lte(stackerDbSlots.createdAt, to),
          ),
        )
        .orderBy(desc(stackerDbSlots.createdAt))
        .limit(100);

      return c.json<{ chunks: ChunkEventParsed[] }>({
        chunks: chunks.map(serializeDbChunk),
      });
    },
  )

  .get(
    '/chunks/id/:id',
    zValidator('param', z.object({ id: z.coerce.number() })),
    async (c) => {
      const id = c.req.valid('param').id;
      const [chunk] = await db
        .select()
        .from(stackerDbSlots)
        .where(eq(stackerDbSlots.id, id));
      if (!chunk) {
        throw new Error('Chunk not found');
      }
      return c.json(serializeDbChunk(chunk));
    },
  )

  .get('/chunks/:networkKey', async (c) => {
    const networkKey = c.req.param('networkKey');

    const chunks = await db
      .select()
      .from(stackerDbSlots)
      .where(eq(stackerDbSlots.networkKey, networkKey))
      .orderBy(desc(stackerDbSlots.createdAt))
      .limit(1000);

    const chunkEvents: ChunkEventParsed[] = chunks.map(serializeDbChunk);

    return c.json(chunkEvents);
  })

  .get('/chunks/signer-latest/:networkKey', async (c) => {
    const networkKey = c.req.param('networkKey');
    const responses = await getLatestResponses(networkKey);
    return c.json(responses);
  });

export { getChunksRoutes };
