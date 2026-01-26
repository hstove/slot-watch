import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { makeDb, type Db } from '../db/db';
import { z } from 'zod';
import {
  blockProposals,
  blockResponses,
  burnBlocks,
  stacksBlocks,
} from '../db/schema';
import { and, desc, eq, sql } from 'drizzle-orm';
import { or } from 'drizzle-orm';
import { getPoxInfo, getStackerSet } from '../stacks-api';
import { mapSignerDataToResponses } from '../db/block-responses';
import { inspect } from 'node:util';
import { Effect } from 'effect';
import type { StreamerService } from '../effect/layers/streamer';
import { DbService } from '../effect/layers/db';
import { runEffect } from '../effect/runtime';
import { env } from 'cloudflare:workers';
import {
  serializeBlockProposal,
  serializeStacksBlock,
} from '../db/serializers';
import { mergeBlockData } from 'slot-watch-common/stacks-blocks';
import {
  BlockResponseRejectReasons,
  createStacksRpcClient,
  getVersionFromString,
  getSortitionByBurnBlockHeight,
  getSortitionByBurnHeaderHash,
  getSortitionByConsensusHash,
  type SortitionResponse,
  type RejectReasonPrefix,
} from 'slot-watch-common';
import { omit } from 'es-toolkit';
import { getCreatedAt } from '../utils';

async function runMcpEffect<E>(
  effect: Effect.Effect<string, E, DbService | StreamerService>
) {
  const result = await runEffect(effect);
  return {
    content: [{ type: 'text' as const, text: result }],
  };
}

function formatSortition(sortition: SortitionResponse) {
  return {
    bitcoinBlockHash: sortition.burn_block_hash,
    bitcoinBlockHeight: sortition.burn_block_height,
    bitcoinBlockTimestamp: sortition.burn_header_timestamp,
    consensusHash: sortition.consensus_hash,
    sortitionId: sortition.sortition_id,
    parentSortitionId: sortition.parent_sortition_id,
    wasSortition: sortition.was_sortition,
    minerPkHash160: sortition.miner_pk_hash160 ?? null,
    stacksParentConsensusHash: sortition.stacks_parent_ch ?? null,
    lastSortitionConsensusHash: sortition.last_sortition_ch ?? null,
    committedBlockHash: sortition.committed_block_hash ?? null,
    vrfSeed: sortition.vrf_seed ?? null,
  };
}

function getSortitionLookupCount(args: {
  consensusHash?: string;
  bitcoinBlockHash?: string;
  bitcoinBlockHeight?: number;
}) {
  return [
    typeof args.consensusHash === 'string',
    typeof args.bitcoinBlockHash === 'string',
    typeof args.bitcoinBlockHeight === 'number',
  ].filter(Boolean).length;
}

function fetchSortition(
  client: ReturnType<typeof createStacksRpcClient>,
  args: {
    consensusHash?: string;
    bitcoinBlockHash?: string;
    bitcoinBlockHeight?: number;
  }
): Promise<SortitionResponse | null> {
  if (typeof args.consensusHash === 'string') {
    return getSortitionByConsensusHash(client, args.consensusHash);
  }

  if (typeof args.bitcoinBlockHash === 'string') {
    return getSortitionByBurnHeaderHash(client, args.bitcoinBlockHash);
  }

  if (typeof args.bitcoinBlockHeight === 'number') {
    return getSortitionByBurnBlockHeight(client, args.bitcoinBlockHeight);
  }

  return Promise.resolve(null);
}

const getStackers = () =>
  Effect.gen(function* () {
    return yield* Effect.promise(async () => {
      const poxInfo = await getPoxInfo.get('mainnet');
      const stackerSet = await getStackerSet('mainnet', poxInfo.rewardCycleId);
      return stackerSet;
    });
  });

export const makeMcpServer = () => {
  const server = new McpServer({
    name: 'slot-watch',
    version: '1.0.0',
    description: 'Slot Watch MCP Server',
  });

  server.registerTool(
    'get-stacks-block',
    {
      description:
        'Fetch a Stacks block by a block hash, height, or index block hash. You must provide at least one lookup field.',
      inputSchema: {
        blockHeight: z
          .number()
          .optional()
          .describe('The height of the Stacks block'),
        blockHash: z
          .string()
          .optional()
          .describe('The hash of the Stacks block'),
        indexBlockHash: z
          .string()
          .optional()
          .describe(
            'The index block hash of the Stacks block. This is a hash of (blockHash, consensusHash), which means it is unique across forks.'
          ),
      },
    },
    (args) => {
      return runMcpEffect(
        Effect.gen(function* () {
          const db = yield* DbService;

          const stackerSet = yield* getStackers();

          const [dbBlock, dbProposal] = yield* Effect.all(
            [
              db.withDb((db) =>
                db.query.stacksBlocks.findFirst({
                  where: or(
                    args.blockHash
                      ? eq(stacksBlocks.blockHash, args.blockHash)
                      : undefined,
                    typeof args.blockHeight === 'number'
                      ? eq(stacksBlocks.blockHeight, args.blockHeight)
                      : undefined,
                    args.indexBlockHash
                      ? eq(stacksBlocks.indexBlockHash, args.indexBlockHash)
                      : undefined
                  ),
                })
              ),
              db.withDb((db) =>
                db.query.blockProposals.findFirst({
                  where: or(
                    args.blockHash
                      ? eq(blockProposals.signerSignatureHash, args.blockHash)
                      : undefined,
                    args.indexBlockHash
                      ? eq(blockProposals.indexBlockHash, args.indexBlockHash)
                      : undefined,
                    args.blockHeight
                      ? eq(blockProposals.burnBlockHeight, args.blockHeight)
                      : undefined
                  ),
                })
              ),
            ],
            {
              concurrency: 'unbounded',
            }
          );

          if (!dbProposal) {
            return 'No block found';
          }

          const block = dbBlock ? serializeStacksBlock(dbBlock) : null;
          const proposal = serializeBlockProposal(dbProposal);

          const merged = mergeBlockData(proposal, block);
          const blockSummary = omit(merged, [
            'networkKey',
            'txCount',
            'txFees',
            'readCount',
            'readLength',
            'runtime',
            'writeCount',
            'writeLength',
            'serverVersion',
            'serverVersionShort',
          ]);

          const responses = yield* db.withDb((db) =>
            db.query.blockResponses.findMany({
              where: and(
                eq(blockProposals.networkKey, 'mainnet'),
                eq(
                  blockProposals.signerSignatureHash,
                  dbProposal.signerSignatureHash
                )
              ),
            })
          );

          const responsesWithSigners = mapSignerDataToResponses({
            stackerSet,
            responses,
          });

          const signers = responsesWithSigners.signers.map((signer) => {
            const reason = signer.rejectReason
              ? BlockResponseRejectReasons[
                  signer.rejectReason as RejectReasonPrefix
                ]
              : null;

            const rejectInfo =
              signer.accepted === false
                ? {
                    rejectCode: signer.rejectCode,
                    validationCode: signer.validationCode,
                    reason: signer.reason,
                    reasonDescription: reason?.description ?? null,
                    reasonLabel: reason?.label ?? null,
                    rejectReason: signer.rejectReason ?? null,
                  }
                : {};
            return {
              signingKey: signer.signing_key,
              weight: signer.weightPercentStr,
              name: signer.label,
              accepted: signer.accepted ?? null,
              version: getVersionFromString(signer.version ?? ''),
              latencyMs: signer.latencyMs,
              ...rejectInfo,
            };
          });

          return JSON.stringify({
            block: {
              ...blockSummary,
              minerVersion: merged.serverVersionShort,
            },
            responses: {
              accepted: responsesWithSigners.accepted,
              countAccepted: responsesWithSigners.countAccepted,
              countRejected: responsesWithSigners.countRejected,
              signers,
              rejectRatio: responsesWithSigners.rejectRatio,
              acceptRatio: responsesWithSigners.acceptRatio,
            },
          });
        })
      );
    }
  );

  server.registerTool(
    'get-recent-stacks-blocks',
    {
      description:
        'List the most recent block Stacks blocks. Blocks that have been proposed but not yet processed will have `accepted` as `false`.',
      inputSchema: {
        limit: z
          .number()
          .int()
          .min(1)
          .max(200)
          .optional()
          .describe('Max proposals to return (default 50, max 200)'),
      },
    },
    (args) => {
      return runMcpEffect(
        Effect.gen(function* () {
          const db = yield* DbService;
          const limit = Math.min(args.limit ?? 50, 200);

          const proposals = yield* db.withDb((db) =>
            db
              .select({
                id: blockProposals.id,
                signerSignatureHash: blockProposals.signerSignatureHash,
                indexBlockHash: blockProposals.indexBlockHash,
                burnBlockHeight: blockProposals.burnBlockHeight,
                chainLength: blockProposals.chainLength,
                blockTimestamp: blockProposals.blockTimestamp,
                minerPublicKey: blockProposals.minerPublicKey,
                serverVersion: blockProposals.serverVersion,
                stacksBlockHash: stacksBlocks.blockHash,
                stacksBlockHeight: stacksBlocks.blockHeight,
                consensusHash: stacksBlocks.consensusHash,
              })
              .from(blockProposals)
              .leftJoin(
                stacksBlocks,
                and(
                  eq(
                    stacksBlocks.blockHash,
                    blockProposals.signerSignatureHash
                  ),
                  eq(stacksBlocks.networkKey, blockProposals.networkKey)
                )
              )
              .where(eq(blockProposals.networkKey, 'mainnet'))
              .orderBy(desc(blockProposals.id))
              .limit(limit)
          );

          const items = proposals.map((proposal) => {
            const accepted = Boolean(proposal.stacksBlockHash);
            return {
              blockHash: proposal.signerSignatureHash,
              indexBlockHash: proposal.indexBlockHash,
              consensusHash: proposal.consensusHash,
              bitcoinBlockHeight: proposal.burnBlockHeight,
              height: proposal.chainLength,
              blockTimestamp: proposal.blockTimestamp.toISOString(),
              proposedAt: getCreatedAt(proposal.id).toISOString(),
              minerPublicKey: proposal.minerPublicKey,
              serverVersionShort: proposal.serverVersion
                ? getVersionFromString(proposal.serverVersion)
                : null,
              accepted,
              stacksBlockHash: accepted ? proposal.stacksBlockHash : null,
              stacksBlockHeight: accepted ? proposal.stacksBlockHeight : null,
            };
          });

          return JSON.stringify({
            limit,
            proposals: items,
          });
        })
      );
    }
  );

  server.registerTool(
    'get-recent-bitcoin-blocks',
    {
      description:
        'List the most recent Bitcoin blocks and the count of Stacks blocks associated by consensus hash.',
      inputSchema: {
        limit: z
          .number()
          .int()
          .min(1)
          .max(200)
          .optional()
          .describe('Max Bitcoin blocks to return (default 50, max 200)'),
      },
    },
    (args) => {
      return runMcpEffect(
        Effect.gen(function* () {
          const db = yield* DbService;
          const limit = Math.min(args.limit ?? 50, 200);

          const blocks = yield* db.withDb((db) =>
            db
              .select({
                id: burnBlocks.id,
                bitcoinBlockHeight: burnBlocks.burnBlockHeight,
                bitcoinBlockHash: burnBlocks.burnBlockHash,
                consensusHash: burnBlocks.consensusHash,
                stacksBlockCount: sql<number>`count(${stacksBlocks.id})`,
              })
              .from(burnBlocks)
              .leftJoin(
                stacksBlocks,
                and(
                  eq(stacksBlocks.consensusHash, burnBlocks.consensusHash),
                  eq(stacksBlocks.networkKey, burnBlocks.networkKey)
                )
              )
              .where(eq(burnBlocks.networkKey, 'mainnet'))
              .groupBy(burnBlocks.id)
              .orderBy(desc(burnBlocks.id))
              .limit(limit)
          );

          const items = blocks.map((block) => ({
            blockHash: block.bitcoinBlockHash,
            bitcoinBlockHeight: block.bitcoinBlockHeight,
            consensusHash: block.consensusHash,
            stacksBlockCount: Number(block.stacksBlockCount),
            observedAt: getCreatedAt(block.id).toISOString(),
          }));

          return JSON.stringify({
            limit,
            blocks: items,
          });
        })
      );
    }
  );

  server.registerTool(
    'get-tenure',
    {
      description:
        'Fetch a tenure by consensus hash, Bitcoin block hash, or Bitcoin block height. Provide exactly one lookup field.',
      inputSchema: {
        consensusHash: z
          .string()
          .optional()
          .describe('The consensus hash for the sortition'),
        bitcoinBlockHash: z
          .string()
          .optional()
          .describe('The Bitcoin block hash (burn header hash)'),
        bitcoinBlockHeight: z
          .number()
          .int()
          .optional()
          .describe('The Bitcoin block height'),
      },
    },
    (args) => {
      return runMcpEffect(
        Effect.gen(function* () {
          const lookups = getSortitionLookupCount(args);

          if (lookups !== 1) {
            return 'Provide exactly one of consensusHash, bitcoinBlockHash, or bitcoinBlockHeight.';
          }

          const client = createStacksRpcClient(
            'mainnet',
            env.HIRO_API_KEY ?? ''
          );

          const sortition = yield* Effect.promise(() =>
            fetchSortition(client, args)
          );

          if (!sortition) {
            return 'No sortition found';
          }

          return JSON.stringify({
            tenure: formatSortition(sortition),
          });
        })
      );
    }
  );

  return server;
};
