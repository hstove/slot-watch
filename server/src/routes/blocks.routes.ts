import { Hono } from 'hono';
import { db } from '../db/db';
import { and, desc, eq, getTableColumns, isNotNull } from 'drizzle-orm';
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
import {
  fetchRecentMinerStats,
  getAllLatestBlockProposals,
  serializeBlockProposal,
} from '../db/block-proposals';
import { log, logger } from '../logger';
import { getPoolStatus } from '../db/db';
import { timeout } from 'hono/timeout';

const blockRoutes = new Hono()
  .use('*', timeout(5000))
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
      const btcBlocks = await db
        .select()
        .from(burnBlocks)
        .where(eq(burnBlocks.networkKey, networkKey))
        .orderBy(desc(burnBlocks.id))
        .limit(3);

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
      log
        .withError(error)
        .withMetadata({
          route: c.req.path,
          networkKey,
        })
        .error('Error fetching burn blocks');

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
      .orderBy(desc(burnBlocks.id))
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
        .orderBy(desc(blockProposals.chainLength), desc(blockProposals.id));
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
      // const { id, ...tableColumns } = getTableColumns(stacksBlocks);
      const tenureChanges = await db
        .select()
        .from(stacksBlocks)
        .where(
          and(
            eq(stacksBlocks.networkKey, networkKey),
            typeof cause === 'number'
              ? eq(stacksBlocks.tenureChangeCause, cause)
              : isNotNull(stacksBlocks.tenureChangeCause),
          ),
        )
        .orderBy(desc(stacksBlocks.id))
        .limit(5);
      return c.json({ tenureChanges: tenureChanges.map(serializeStacksBlock) });
    },
  )
  // .get('/db-health', async (c) => {
  //   try {
  //     const timeoutPromise = new Promise<void>((_, reject) => {
  //       setTimeout(() => reject(new Error('Query timeout after 3000ms')), 3000);
  //     });
  //     logger.debug({ module: 'db-health' }, 'Starting DB health check');
  //     const dbPromise = db
  //       .select()
  //       .from(burnBlocks)
  //       .where(eq(burnBlocks.networkKey, 'mainnet'))
  //       .limit(1);
  //     const poolStatus = getPoolStatus();
  //     logger.debug(
  //       {
  //         ...poolStatus,
  //         module: 'db-health',
  //       },
  //       'DB health check',
  //     );
  //     await Promise.race([dbPromise, timeoutPromise]);
  //     logger.info({ module: 'db-health' }, 'DB health check complete');
  //     return c.json({ status: 'healthy', pool: poolStatus });
  //   } catch (error) {
  //     log
  //       .withError(error)
  //       .withMetadata({
  //         module: 'db-health',
  //       })
  //       .error('Error fetching db health');
  //     return c.json({ status: 'unhealthy', error: String(error) }, 500);
  //   }
  // })
  .get('/:networkKey/miners', async (c) => {
    const networkKey = c.req.param('networkKey');
    // const latestBlockProposals = await getAllLatestBlockProposals(networkKey);
    const minerStats = await fetchRecentMinerStats(networkKey);
    return c.json({
      // latestBlockProposals,
      minerStats,
    });
  });

export { blockRoutes };
