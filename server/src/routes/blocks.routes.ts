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
import { serializeBlockProposal } from '../db/block-proposals';
import { log, logger } from '../logger';
import { timeout } from 'hono/timeout';
import type { ServerType } from '../server-context';
import { Schema } from 'effect';
import { describeRoute, resolver, validator } from 'hono-openapi';
import {
  BurnBlocksResponseSchema,
  BurnBlockResponseSchema,
  BurnBlockBlocksResponseSchema,
  TenureChangesResponseSchema,
  BlockResponsesResponseSchema,
  BlockProposalWithResponsesSchema,
  StxBlockResponseSchema,
} from 'slot-watch-common';

// Request param/query schemas (local to routes)
const NetworkKeyParamSchema = Schema.standardSchemaV1(
  Schema.Struct({
    networkKey: Schema.String,
  }).annotations({ identifier: 'NetworkKeyParam' })
);

const BlockHashParamSchema = Schema.standardSchemaV1(
  Schema.Struct({
    networkKey: Schema.String,
    blockHash: Schema.String,
  }).annotations({ identifier: 'BlockHashParam' })
);

const BlockIdParamSchema = Schema.standardSchemaV1(
  Schema.Struct({
    networkKey: Schema.String,
    blockId: Schema.String,
  }).annotations({ identifier: 'BlockIdParam' })
);

const HeightOrHashParamSchema = Schema.standardSchemaV1(
  Schema.Struct({
    networkKey: Schema.String,
    heightOrHash: Schema.String,
  }).annotations({ identifier: 'HeightOrHashParam' })
);

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
const burnBlockResponse = Schema.standardSchemaV1(BurnBlockResponseSchema);
const burnBlockBlocksResponse = Schema.standardSchemaV1(
  BurnBlockBlocksResponseSchema
);
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
  .get(
    '/get_block/:networkKey/:blockHash',
    describeRoute({
      summary: 'Get block details',
      description:
        'Get detailed block information including proposal, responses, and pushes',
      tags: ['Stacks Blocks'],
      responses: {
        200: {
          description: 'Block details with proposal and responses',
          content: {
            'application/json': {
              schema: resolver(blockProposalWithResponses),
            },
          },
        },
      },
    }),
    validator('param', BlockHashParamSchema),
    async (c) => {
      const { networkKey, blockHash } = c.req.valid('param');
      const { rewardCycleId } = await getPoxInfo.get(networkKey);
      const stackerSet = await getStackerSet(networkKey, rewardCycleId);

      const [pushes] = await c
        .get('db')
        .select()
        .from(blockPushes)
        .where(
          and(
            eq(blockPushes.signerSignatureHash, blockHash),
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
            eq(blockProposals.signerSignatureHash, blockHash),
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
            eq(blockResponses.signerSignatureHash, blockHash),
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
    }
  )
  .get(
    '/blocks/:networkKey/:blockId/responses',
    describeRoute({
      summary: 'Get block responses by ID',
      description: 'Get signer responses for a specific block by block ID',
      tags: ['Stacks Blocks'],
      responses: {
        200: {
          description: 'List of signer responses',
          content: {
            'application/json': { schema: resolver(blockResponsesResponse) },
          },
        },
      },
    }),
    validator('param', BlockIdParamSchema),
    async (c) => {
      const { networkKey, blockId } = c.req.valid('param');
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
      summary: 'Get recent burn blocks',
      description: 'Get the most recent burn blocks for a network',
      tags: ['Burn Blocks'],
      responses: {
        200: {
          description: 'List of recent burn blocks',
          content: {
            'application/json': { schema: resolver(burnBlocksResponse) },
          },
        },
      },
    }),
    validator('param', NetworkKeyParamSchema),
    async (c) => {
      const { networkKey } = c.req.valid('param');
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
  .get(
    '/burn-blocks/:networkKey/:heightOrHash',
    describeRoute({
      summary: 'Get burn block by height or hash',
      description: 'Get a specific burn block by its height or hash identifier',
      tags: ['Burn Blocks'],
      responses: {
        200: {
          description: 'Burn block details',
          content: {
            'application/json': { schema: resolver(burnBlockResponse) },
          },
        },
      },
    }),
    validator('param', HeightOrHashParamSchema),
    async (c) => {
      const { networkKey, heightOrHash } = c.req.valid('param');
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
      return c.json({
        btcBlock: btcBlock ? serializeBurnBlock(btcBlock) : null,
      });
    }
  )
  .get(
    '/burn-blocks/:networkKey/:consensusHash/blocks',
    describeRoute({
      summary: 'Get blocks in a tenure',
      description:
        'Get all Stacks blocks proposed during a specific burn block tenure',
      tags: ['Burn Blocks'],
      responses: {
        200: {
          description: 'List of blocks in the tenure',
          content: {
            'application/json': { schema: resolver(burnBlockBlocksResponse) },
          },
        },
      },
    }),
    validator('param', ConsensusHashParamSchema),
    async (c) => {
      const { consensusHash, networkKey } = c.req.valid('param');
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
      summary: 'Get recent tenure changes',
      description:
        'Get recent tenure change blocks, optionally filtered by cause',
      tags: ['Stacks Blocks'],
      responses: {
        200: {
          description: 'List of recent tenure changes',
          content: {
            'application/json': { schema: resolver(tenureChangesResponse) },
          },
        },
      },
    }),
    validator('param', NetworkKeyParamSchema),
    validator('query', TenureChangesQuerySchema),
    async (c) => {
      const { networkKey } = c.req.valid('param');
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
  .get(
    '/:networkKey/blocks/:blockHash/responses',
    describeRoute({
      summary: 'Get block proposal with responses',
      description:
        'Get a block proposal and all signer responses for a specific block',
      tags: ['Stacks Blocks'],
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
    validator('param', BlockHashParamSchema),
    async (c) => {
      const { networkKey, blockHash } = c.req.valid('param');
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
      summary: 'Get Stacks block by hash',
      description: 'Get a specific Stacks block and its proposal by block hash',
      tags: ['Stacks Blocks'],
      responses: {
        200: {
          description: 'Stacks block with proposal',
          content: {
            'application/json': { schema: resolver(stxBlockResponse) },
          },
        },
      },
    }),
    validator('param', BlockHashParamSchema),
    async (c) => {
      const { networkKey, blockHash } = c.req.valid('param');
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
