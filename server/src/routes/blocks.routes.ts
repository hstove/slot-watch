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
import { serializeBlockProposal } from '../db/block-proposals';

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
    const btcBlocks = await db
      .select()
      .from(burnBlocks)
      .where(eq(burnBlocks.networkKey, networkKey))
      .orderBy(desc(burnBlocks.createdAt))
      .limit(3);
    return c.json({ burnBlocks: btcBlocks.map(serializeBurnBlock) });
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
  );

export { blockRoutes };
