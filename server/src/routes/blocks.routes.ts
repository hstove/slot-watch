import { Hono } from 'hono';
import { and, asc, desc, eq, isNotNull } from 'drizzle-orm';
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
import {
  fetchRecentMinerStats,
  serializeBlockProposal,
} from '../db/block-proposals';
import { log, logger } from '../logger';
import { timeout } from 'hono/timeout';
import type { ServerType } from '../server-context';
import { Schema } from 'effect';
import { describeRoute, resolver, validator } from 'hono-openapi';
import {
  BurnBlocksResponseSchema,
  TenureChangesResponseSchema,
  BlockResponsesResponseSchema,
  BlockProposalWithResponsesSchema,
  StxBlockResponseSchema,
} from 'slot-watch-common';

// Request param/query schemas (local to routes)
const ConsensusHashParamSchema = Schema.standardSchemaV1(
  Schema.Struct({
    consensusHash: Schema.String,
    networkKey: Schema.String,
  }).annotations({ identifier: 'ConsensusHashParam' })
);

const TenureChangesQuerySchema = Schema.standardSchemaV1(
  Schema.Struct({
    cause: Schema.optional(Schema.NumberFromString),
  }).annotations({ identifier: 'TenureChangesQuery' })
);

// Standard Schema wrappers for OpenAPI resolver
const burnBlocksResponse = Schema.standardSchemaV1(BurnBlocksResponseSchema);
const tenureChangesResponse = Schema.standardSchemaV1(
  TenureChangesResponseSchema
);
const blockResponsesResponse = Schema.standardSchemaV1(
  BlockResponsesResponseSchema
);
const blockProposalWithResponses = Schema.standardSchemaV1(
  BlockProposalWithResponsesSchema
);
const stxBlockResponse = Schema.standardSchemaV1(StxBlockResponseSchema);

const blockRoutes = new Hono<ServerType>()
  .use('*', timeout(5000))
  .get('/get_block/:networkKey/:blockId', async (c) => {
    const networkKey = c.req.param('networkKey');
    const blockId = c.req.param('blockId');
    const { rewardCycleId } = await getPoxInfo.get(networkKey);
    const stackerSet = await getStackerSet(networkKey, rewardCycleId);

    const [pushes] = await c
      .get('db')
      .select()
      .from(blockPushes)
      .where(
        and(
          eq(blockPushes.signerSignatureHash, blockId),
          eq(blockPushes.networkKey, networkKey)
        )
      )
      .limit(1);
    const [proposal] = await c
      .get('db')
      .select()
      .from(blockProposals)
      .where(
        and(
          eq(blockProposals.signerSignatureHash, blockId),
          eq(blockProposals.networkKey, networkKey)
        )
      )
      .limit(1);
    const responses = await c
      .get('db')
      .select()
      .from(blockResponses)
      .where(
        and(
          eq(blockResponses.signerSignatureHash, blockId),
          eq(blockResponses.networkKey, networkKey)
        )
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
  .get(
    '/blocks/:networkKey/:blockId/responses',
    describeRoute({
      description: 'Get signer responses for a block',
      responses: {
        200: {
          description: 'List of signer responses',
          content: {
            'application/json': { schema: resolver(blockResponsesResponse) },
          },
        },
      },
    }),
    async (c) => {
      const networkKey = c.req.param('networkKey');
      const blockId = c.req.param('blockId');
      const responses = await c
        .get('db')
        .select()
        .from(blockResponses)
        .where(
          and(
            eq(blockResponses.networkKey, networkKey),
            eq(blockResponses.signerSignatureHash, blockId)
          )
        );
      const serializedResponses = responses.map(serializeBlockResponse);
      return c.json({ responses: serializedResponses });
    }
  )
  .get(
    '/burn-blocks/:networkKey',
    describeRoute({
      description: 'Get recent burn blocks for a network',
      responses: {
        200: {
          description: 'List of recent burn blocks',
          content: {
            'application/json': { schema: resolver(burnBlocksResponse) },
          },
        },
      },
    }),
    async (c) => {
      const networkKey = c.req.param('networkKey');
      logger.debug(
        {
          route: c.req.path,
          networkKey,
        },
        `Fetching burn blocks for ${networkKey}`
      );

      try {
        const btcBlocks = await c
          .get('db')
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
          `Fetched ${btcBlocks.length} burn blocks for ${networkKey}`
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
    }
  )
  .get('/burn-blocks/:networkKey/:heightOrHash', async (c) => {
    const networkKey = c.req.param('networkKey');
    const heightOrHash = c.req.param('heightOrHash');
    let heightMaybe: number | null = null;
    try {
      const heightBn = BigInt(heightOrHash);
      heightMaybe = Number(heightBn);
      // biome-ignore lint/suspicious/noEmptyBlockStatements: ignored using `--suppress`
    } catch (error) {}
    const [btcBlock] = await c
      .get('db')
      .select()
      .from(burnBlocks)
      .where(
        and(
          typeof heightMaybe === 'number'
            ? eq(burnBlocks.burnBlockHeight, heightMaybe)
            : eq(burnBlocks.burnBlockHash, heightOrHash),
          eq(burnBlocks.networkKey, networkKey)
        )
      )
      .orderBy(desc(burnBlocks.id))
      .limit(1);
    return c.json({ btcBlock: btcBlock ? serializeBurnBlock(btcBlock) : null });
  })
  .get(
    '/burn-blocks/:networkKey/:consensusHash/blocks',
    validator('param', ConsensusHashParamSchema),
    async (c) => {
      const { consensusHash, networkKey } = c.req.valid('param');
      // const networkKey = c.req.valid;
      // const burnBlockHeight = c.req.valid;
      const blocks = await c
        .get('db')
        .select()
        .from(blockProposals)
        .leftJoin(
          stacksBlocks,
          and(
            eq(blockProposals.signerSignatureHash, stacksBlocks.blockHash),
            eq(stacksBlocks.networkKey, networkKey)
          )
        )
        .where(
          and(
            eq(blockProposals.consensusHash, consensusHash),
            eq(blockProposals.networkKey, networkKey)
          )
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
    }
  )
  .get(
    '/tenure-changes/:networkKey',
    describeRoute({
      description: 'Get recent tenure changes for a network',
      responses: {
        200: {
          description: 'List of recent tenure changes',
          content: {
            'application/json': { schema: resolver(tenureChangesResponse) },
          },
        },
      },
    }),
    validator('query', TenureChangesQuerySchema),
    async (c) => {
      const networkKey = c.req.param('networkKey');
      const { cause } = c.req.valid('query');
      const tenureChanges = await c
        .get('db')
        .select()
        .from(stacksBlocks)
        .where(
          and(
            eq(stacksBlocks.networkKey, networkKey),
            typeof cause === 'number'
              ? eq(stacksBlocks.tenureChangeCause, cause)
              : isNotNull(stacksBlocks.tenureChangeCause)
          )
        )
        .orderBy(desc(stacksBlocks.id))
        .limit(5);
      return c.json({ tenureChanges: tenureChanges.map(serializeStacksBlock) });
    }
  )
  .get('/:networkKey/miners', async (c) => {
    const networkKey = c.req.param('networkKey');
    // const latestBlockProposals = await getAllLatestBlockProposals(networkKey);
    const minerStats = await fetchRecentMinerStats(networkKey, c.get('db'));
    return c.json({
      // latestBlockProposals,
      minerStats,
    });
  })
  .get(
    '/:networkKey/blocks/:blockHash/responses',
    describeRoute({
      description: 'Get block proposal with signer responses',
      responses: {
        200: {
          description: 'Block proposal and responses',
          content: {
            'application/json': {
              schema: resolver(blockProposalWithResponses),
            },
          },
        },
      },
    }),
    async (c) => {
      const networkKey = c.req.param('networkKey');
      const blockHash = c.req.param('blockHash');
      const blockProposal = await c.get('db').query.blockProposals.findFirst({
        where: eq(blockProposals.signerSignatureHash, blockHash),
      });
      if (!blockProposal) {
        return c.json({ error: 'Block not found' }, 404);
      }
      const responses = await c.get('db').query.blockResponses.findMany({
        where: eq(blockResponses.signerSignatureHash, blockHash),
        orderBy: [asc(blockResponses.id)],
      });

      return c.json({
        blockProposal: serializeBlockProposal(blockProposal),
        responses: responses.map(serializeBlockResponse),
      });
    }
  )
  .get(
    '/blocks/:networkKey/stx-blocks/:blockHash',
    describeRoute({
      description: 'Get a Stacks block by hash',
      responses: {
        200: {
          description: 'Stacks block with proposal',
          content: {
            'application/json': { schema: resolver(stxBlockResponse) },
          },
        },
      },
    }),
    async (c) => {
      const networkKey = c.req.param('networkKey');
      const blockHash = c.req.param('blockHash');
      const blockProposal = await c.get('db').query.blockProposals.findFirst({
        where: eq(blockProposals.signerSignatureHash, blockHash),
      });
      if (!blockProposal) {
        return c.json({ error: 'Block not found' }, 404);
      }
      const stxBlock = await c.get('db').query.stacksBlocks.findFirst({
        where: eq(stacksBlocks.blockHash, blockHash),
      });
      if (!stxBlock) {
        return c.json({ error: 'Block not found' }, 404);
      }
      const stxBlockData = serializeStacksBlock(stxBlock);
      const proposalData = serializeBlockProposal(blockProposal);
      return c.json({
        stacksBlock: stxBlockData,
        proposal: proposalData,
      });
    }
  );

export { blockRoutes };
