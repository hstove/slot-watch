import { Hono } from 'hono';
import { db } from '../db/db';
import { and, desc, eq, getTableColumns, isNotNull, or } from 'drizzle-orm';
import {
  blockPushes,
  blockProposals,
  blockResponses,
  burnBlocks,
  stacksBlocks,
} from '../db/schema';
import { getPoxInfo, getStackerSet } from '../stacks-api';
import {
  mapSignerDataToResponses,
  serializeBlockResponse,
} from '../db/block-responses';
import { serializeBurnBlock, serializeStacksBlock } from '../db/blocks';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { serializeBlockProposal } from '../db/block-proposals';
import { logger } from '../logger';
import { getPoolStatus } from '../db/db';
import { sql } from 'drizzle-orm';

const blockRoutes = new Hono()
  .get('/get_block/:networkKey/:blockId', async (c) => {
    const networkKey = c.req.param('networkKey');
    const blockId = c.req.param('blockId');
    const { rewardCycleId } = await getPoxInfo.get(networkKey);
    const stackerSet = await getStackerSet(networkKey, rewardCycleId);

    const [pushes] = await db
      .select()
      .from(blockPushes)
      .where(
        and(
          eq(blockPushes.signerSignatureHash, blockId),
          eq(blockPushes.networkKey, networkKey),
        ),
      )
      .limit(1);
    const [proposal] = await db
      .select()
      .from(blockProposals)
      .where(
        and(
          eq(blockProposals.signerSignatureHash, blockId),
          eq(blockProposals.networkKey, networkKey),
        ),
      )
      .limit(1);
    const responses = await db
      .select()
      .from(blockResponses)
      .where(
        and(
          eq(blockResponses.signerSignatureHash, blockId),
          eq(blockResponses.networkKey, networkKey),
        ),
      );

    const responsesWithSigners = mapSignerDataToResponses({
      stackerSet,
      responses,
    });

    const response = {
      proposal,
      responses: responsesWithSigners,
      pushes,
    };
    return c.json(response);
  })
  .get('/blocks/:networkKey/:blockId/responses', async (c) => {
    const networkKey = c.req.param('networkKey');
    const blockId = c.req.param('blockId');
    const responses = await db
      .select()
      .from(blockResponses)
      .where(
        and(
          eq(blockResponses.networkKey, networkKey),
          eq(blockResponses.signerSignatureHash, blockId),
        ),
      );
    const serializedResponses = responses.map(serializeBlockResponse);
    return c.json({ responses: serializedResponses });
  })
  .get('/burn-blocks/:networkKey', async (c) => {
    const networkKey = c.req.param('networkKey');
    logger.debug(
      {
        route: c.req.path,
        networkKey,
      },
      `Fetching burn blocks for ${networkKey}`,
    );

    try {
      const queryPromise = db
        .select()
        .from(burnBlocks)
        .where(eq(burnBlocks.networkKey, networkKey))
        .orderBy(desc(burnBlocks.createdAt))
        .limit(3);

      const timeoutPromise = new Promise<void>((_, reject) => {
        setTimeout(() => reject(new Error('Query timeout after 5000ms')), 5000);
      });

      const btcBlocks = await Promise.race([queryPromise, timeoutPromise]);
      if (btcBlocks === undefined) {
        return c.json({ error: 'Database query timed out' }, 500);
      }

      logger.debug(
        {
          route: c.req.path,
          networkKey,
          count: btcBlocks.length,
        },
        `Fetched ${btcBlocks.length} burn blocks for ${networkKey}`,
      );

      return c.json({ burnBlocks: btcBlocks.map(serializeBurnBlock) });
    } catch (error) {
      logger.error(
        {
          route: c.req.path,
          networkKey,
          error: error instanceof Error ? error.message : 'Unknown error',
          stack: error instanceof Error ? error.stack : undefined,
        },
        'Error fetching burn blocks',
      );

      return c.json({ error: 'Database query failed' }, 500);
    }
  })
  .get('/burn-blocks/:networkKey/:heightOrHash', async (c) => {
    const networkKey = c.req.param('networkKey');
    const heightOrHash = c.req.param('heightOrHash');
    let heightMaybe: number | null = null;
    try {
      const heightBn = BigInt(heightOrHash);
      heightMaybe = Number(heightBn);
    } catch (error) {}
    const [btcBlock] = await db
      .select()
      .from(burnBlocks)
      .where(
        and(
          typeof heightMaybe === 'number'
            ? eq(burnBlocks.burnBlockHeight, heightMaybe)
            : eq(burnBlocks.burnBlockHash, heightOrHash),
          eq(burnBlocks.networkKey, networkKey),
        ),
      )
      .orderBy(desc(burnBlocks.createdAt))
      .limit(1);
    return c.json({ btcBlock: btcBlock ? serializeBurnBlock(btcBlock) : null });
  })
  .get(
    '/burn-blocks/:networkKey/:burnBlockHeight/blocks',
    zValidator(
      'param',
      z.object({ burnBlockHeight: z.coerce.number(), networkKey: z.string() }),
    ),
    async (c) => {
      const { burnBlockHeight, networkKey } = c.req.valid('param');
      // const networkKey = c.req.valid;
      // const burnBlockHeight = c.req.valid;
      const blocks = await db
        .select()
        .from(blockProposals)
        .leftJoin(
          stacksBlocks,
          and(
            eq(blockProposals.signerSignatureHash, stacksBlocks.blockHash),
            eq(stacksBlocks.networkKey, networkKey),
          ),
        )
        .where(
          and(
            eq(blockProposals.burnBlockHeight, burnBlockHeight),
            eq(blockProposals.networkKey, networkKey),
          ),
        )
        .orderBy(
          desc(blockProposals.chainLength),
          desc(blockProposals.createdAt),
        );
      return c.json({
        blocks: blocks.map((b) => ({
          proposal: serializeBlockProposal(b.block_proposals),
          stacksBlock: b.stacks_blocks
            ? serializeStacksBlock(b.stacks_blocks)
            : null,
        })),
      });
    },
  )
  .get(
    '/tenure-changes/:networkKey',
    zValidator(
      'query',
      z.object({
        cause: z.coerce.number().optional(),
      }),
    ),
    async (c) => {
      const networkKey = c.req.param('networkKey');
      const { cause } = c.req.valid('query');
      const { id, ...tableColumns } = getTableColumns(stacksBlocks);
      const tenureChanges = await db
        .select(tableColumns)
        .from(stacksBlocks)
        .where(
          and(
            eq(stacksBlocks.networkKey, networkKey),
            typeof cause === 'number'
              ? eq(stacksBlocks.tenureChangeCause, cause)
              : isNotNull(stacksBlocks.tenureChangeCause),
          ),
        )
        .orderBy(desc(stacksBlocks.createdAt))
        .limit(5);
      return c.json({ tenureChanges: tenureChanges.map(serializeStacksBlock) });
    },
  )
  .get('/db-health', async (c) => {
    try {
      const timeoutPromise = new Promise<void>((_, reject) => {
        setTimeout(() => reject(new Error('Query timeout after 5000ms')), 5000);
      });
      const dbPromise = db
        .select()
        .from(burnBlocks)
        .where(eq(burnBlocks.networkKey, 'mainnet'))
        .limit(1);
      const poolStatus = getPoolStatus();
      logger.debug(
        {
          ...poolStatus,
          module: 'db-health',
        },
        'DB health check',
      );
      await Promise.race([dbPromise, timeoutPromise]);
      return c.json({ status: 'healthy', pool: poolStatus });
    } catch (error) {
      logger.error({ error: String(error) }, 'Error fetching db health');
      process.nextTick(() => {
        process.exit(1);
      });
      return c.json({ status: 'unhealthy', error: String(error) }, 500);
    }
  });

export { blockRoutes };
