import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import {
  getLatestSignerResponsesOutputSchema,
  getLatestStateMachinesOutputSchema,
  getRecentBitcoinBlocksOutputSchema,
  getRecentBlockHealthOutputSchema,
  getRecentStacksBlocksOutputSchema,
  getSignerHealthOutputSchema,
  getStacksBlockOutputSchema,
  getStacksIngestionStatusOutputSchema,
  getTenureBlocksOutputSchema,
  getTenureOutputSchema,
} from './mcp-schemas';
import {
  blockProposals,
  blockResponses,
  blockPushes,
  burnBlocks,
  stacksBlocks,
  stateMachineUpdates,
} from '../db/schema';
import { and, desc, eq, gte, inArray, lte, or, sql } from 'drizzle-orm';
import { getPoxInfo, getStackerSet } from '../stacks-api';
import {
  getLatestResponses,
  mapSignerDataToResponses,
} from '../db/block-responses';
import { Effect } from 'effect';
import type { StreamerService } from '../effect/layers/streamer';
import { DbService } from '../effect/layers/db';
import { runEffect } from '../effect/runtime';
import { env } from 'cloudflare:workers';
import {
  serializeBlockProposal,
  serializeStacksBlock,
  serializeStateMachineUpdate,
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
import { getCreatedAt, uuidAtTime } from '../utils';

async function runMcpEffect<A, E>(
  effect: Effect.Effect<A, E, DbService | StreamerService>
) {
  const result = await runEffect(effect);
  if (!isStructuredContent(result)) {
    const text =
      typeof result === 'string' ? result : JSON.stringify(result, null, 2);
    return {
      content: [{ type: 'text' as const, text }],
      isError: true,
    };
  }

  return {
    content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
    structuredContent: result,
  };
}

const MAX_LIMIT = 200;

function getObservedAt(id: string) {
  return getCreatedAt(id).toISOString();
}

function getAgeSeconds(createdAtIso: string, nowMs: number) {
  const age = nowMs - new Date(createdAtIso).getTime();
  return Math.max(0, Math.floor(age / 1000));
}

function average(values: number[]) {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function isStructuredContent(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function formatBitcoinFields<
  T extends {
    burnBlockHeight?: number | null;
    burnBlockHash?: string | null;
    burnBlockTimestamp?: string | null;
  },
>(input: T) {
  const { burnBlockHeight, burnBlockHash, burnBlockTimestamp, ...rest } = input;
  return {
    ...rest,
    ...(typeof burnBlockHeight !== 'undefined'
      ? { bitcoinBlockHeight: burnBlockHeight }
      : {}),
    ...(typeof burnBlockHash !== 'undefined'
      ? { bitcoinBlockHash: burnBlockHash }
      : {}),
    ...(typeof burnBlockTimestamp !== 'undefined'
      ? { bitcoinBlockTimestamp: burnBlockTimestamp }
      : {}),
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
    'getStacksBlock',
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
      outputSchema: getStacksBlockOutputSchema,
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
                      ? eq(blockProposals.chainLength, args.blockHeight)
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
          const blockSummaryRaw = omit(merged, [
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
          const {
            proposedAt,
            burnBlockHeight,
            burnBlockHash,
            burnBlockTimestamp,
            ...blockSummaryRest
          } = blockSummaryRaw;
          const blockSummary = formatBitcoinFields({
            ...blockSummaryRest,
            observedAt: proposedAt,
            burnBlockHeight,
            burnBlockHash,
            burnBlockTimestamp,
          });

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
              signerPublicKey: signer.signing_key,
              weightPercent: signer.weightPercentStr,
              name: signer.label,
              accepted: signer.accepted ?? null,
              version: getVersionFromString(signer.version ?? ''),
              latencyMs: signer.latencyMs,
              ...rejectInfo,
            };
          });

          return {
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
          };
        })
      );
    }
  );

  server.registerTool(
    'getRecentStacksBlocks',
    {
      description:
        'List recent Stacks block proposals with acceptance status. Blocks proposed but not processed will have `accepted` as `false`.',
      inputSchema: {
        limit: z
          .number()
          .int()
          .min(1)
          .max(200)
          .optional()
          .describe('Max proposals to return (default 50, max 200)'),
        after: z.iso
          .datetime()
          .optional()
          .describe('Only include proposals after this ISO timestamp'),
        before: z.iso
          .datetime()
          .optional()
          .describe('Only include proposals before this ISO timestamp'),
      },
      outputSchema: getRecentStacksBlocksOutputSchema,
    },
    (args) => {
      return runMcpEffect(
        Effect.gen(function* () {
          const db = yield* DbService;
          const limit = Math.min(args.limit ?? 50, MAX_LIMIT);
          const after = args.after ? new Date(args.after) : null;
          const before = args.before ? new Date(args.before) : null;

          if (after && before && after > before) {
            return 'Invalid time window: after must be before or equal to before.';
          }

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
                stacksBlockId: stacksBlocks.id,
                stacksBlockHash: stacksBlocks.blockHash,
                stacksBlockHeight: stacksBlocks.blockHeight,
                consensusHash: blockProposals.consensusHash,
                burnBlockHash: stacksBlocks.burnBlockHash,
                burnBlockTimestamp: stacksBlocks.burnBlockTimestamp,
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
              .where(
                and(
                  eq(blockProposals.networkKey, 'mainnet'),
                  after ? gte(blockProposals.id, uuidAtTime(after)) : undefined,
                  before
                    ? lte(blockProposals.id, uuidAtTime(before))
                    : undefined
                )
              )
              .orderBy(desc(blockProposals.id))
              .limit(limit)
          );

          // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: its ok
          const items = proposals.map((proposal) => {
            const accepted = Boolean(proposal.stacksBlockHash);
            const itemBase = {
              blockHash: proposal.signerSignatureHash,
              indexBlockHash: proposal.indexBlockHash,
              consensusHash: proposal.consensusHash,
              blockHeight: proposal.chainLength,
              blockTimestamp: proposal.blockTimestamp.toISOString(),
              observedAt: getObservedAt(proposal.id),
              minerPublicKey: proposal.minerPublicKey,
              serverVersionShort: proposal.serverVersion
                ? getVersionFromString(proposal.serverVersion)
                : null,
              accepted,
              stacksBlockHash: accepted ? proposal.stacksBlockHash : null,
              stacksBlockHeight: accepted ? proposal.stacksBlockHeight : null,
              processedAt:
                accepted && proposal.stacksBlockId
                  ? getObservedAt(proposal.stacksBlockId)
                  : null,
              burnBlockHeight: proposal.burnBlockHeight,
              burnBlockHash: accepted ? proposal.burnBlockHash : null,
              burnBlockTimestamp:
                accepted && proposal.burnBlockTimestamp
                  ? proposal.burnBlockTimestamp.toISOString()
                  : null,
            };
            return formatBitcoinFields(itemBase);
          });

          return {
            limit,
            proposals: items,
          };
        })
      );
    }
  );

  server.registerTool(
    'getRecentBitcoinBlocks',
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
        after: z.iso
          .datetime()
          .optional()
          .describe('Only include blocks after this ISO timestamp'),
        before: z.iso
          .datetime()
          .optional()
          .describe('Only include blocks before this ISO timestamp'),
      },
      outputSchema: getRecentBitcoinBlocksOutputSchema,
    },
    (args) => {
      return runMcpEffect(
        Effect.gen(function* () {
          const db = yield* DbService;
          const limit = Math.min(args.limit ?? 50, MAX_LIMIT);
          const after = args.after ? new Date(args.after) : null;
          const before = args.before ? new Date(args.before) : null;

          if (after && before && after > before) {
            return 'Invalid time window: after must be before or equal to before.';
          }

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
              .where(
                and(
                  eq(burnBlocks.networkKey, 'mainnet'),
                  after ? gte(burnBlocks.id, uuidAtTime(after)) : undefined,
                  before ? lte(burnBlocks.id, uuidAtTime(before)) : undefined
                )
              )
              .groupBy(burnBlocks.id)
              .orderBy(desc(burnBlocks.id))
              .limit(limit)
          );

          const items = blocks.map((block) => ({
            bitcoinBlockHash: block.bitcoinBlockHash,
            bitcoinBlockHeight: block.bitcoinBlockHeight,
            consensusHash: block.consensusHash,
            stacksBlockCount: Number(block.stacksBlockCount),
            observedAt: getObservedAt(block.id),
          }));

          return {
            limit,
            blocks: items,
          };
        })
      );
    }
  );

  server.registerTool(
    'getStacksIngestionStatus',
    {
      description:
        'Summarize latest observed Stacks/Bitcoin/signing events to spot stalls.',
      inputSchema: {},
      outputSchema: getStacksIngestionStatusOutputSchema,
    },
    () => {
      return runMcpEffect(
        // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: its ok
        Effect.gen(function* () {
          const db = yield* DbService;
          const nowMs = Date.now();

          const [
            [latestStacksBlock],
            [latestProposal],
            [latestResponse],
            [latestPush],
            [latestBitcoin],
            [latestStateMachine],
          ] = yield* Effect.all(
            [
              db.withDb((db) =>
                db
                  .select()
                  .from(stacksBlocks)
                  .where(eq(stacksBlocks.networkKey, 'mainnet'))
                  .orderBy(desc(stacksBlocks.id))
                  .limit(1)
              ),
              db.withDb((db) =>
                db
                  .select()
                  .from(blockProposals)
                  .where(eq(blockProposals.networkKey, 'mainnet'))
                  .orderBy(desc(blockProposals.id))
                  .limit(1)
              ),
              db.withDb((db) =>
                db
                  .select()
                  .from(blockResponses)
                  .where(eq(blockResponses.networkKey, 'mainnet'))
                  .orderBy(desc(blockResponses.id))
                  .limit(1)
              ),
              db.withDb((db) =>
                db
                  .select()
                  .from(blockPushes)
                  .where(eq(blockPushes.networkKey, 'mainnet'))
                  .orderBy(desc(blockPushes.id))
                  .limit(1)
              ),
              db.withDb((db) =>
                db
                  .select()
                  .from(burnBlocks)
                  .where(eq(burnBlocks.networkKey, 'mainnet'))
                  .orderBy(desc(burnBlocks.id))
                  .limit(1)
              ),
              db.withDb((db) =>
                db
                  .select()
                  .from(stateMachineUpdates)
                  .where(eq(stateMachineUpdates.networkKey, 'mainnet'))
                  .orderBy(desc(stateMachineUpdates.id))
                  .limit(1)
              ),
            ],
            {
              concurrency: 'unbounded',
            }
          );

          const stacksBlock = latestStacksBlock
            ? (() => {
                const observedAt = getObservedAt(latestStacksBlock.id);
                return {
                  ...formatBitcoinFields({
                    blockHash: latestStacksBlock.blockHash,
                    indexBlockHash: latestStacksBlock.indexBlockHash,
                    blockHeight: latestStacksBlock.blockHeight,
                    consensusHash: latestStacksBlock.consensusHash,
                    blockTimestamp:
                      latestStacksBlock.blockTimestamp.toISOString(),
                    burnBlockHeight: latestStacksBlock.burnBlockHeight,
                    burnBlockHash: latestStacksBlock.burnBlockHash,
                    burnBlockTimestamp:
                      latestStacksBlock.burnBlockTimestamp.toISOString(),
                  }),
                  observedAt,
                  ageSeconds: getAgeSeconds(observedAt, nowMs),
                };
              })()
            : null;

          const blockProposal = latestProposal
            ? (() => {
                const observedAt = getObservedAt(latestProposal.id);
                return {
                  ...formatBitcoinFields({
                    blockHash: latestProposal.signerSignatureHash,
                    indexBlockHash: latestProposal.indexBlockHash,
                    blockHeight: latestProposal.chainLength,
                    consensusHash: latestProposal.consensusHash,
                    blockTimestamp: latestProposal.blockTimestamp.toISOString(),
                    minerPublicKey: latestProposal.minerPublicKey,
                    serverVersionShort: latestProposal.serverVersion
                      ? getVersionFromString(latestProposal.serverVersion)
                      : null,
                    burnBlockHeight: latestProposal.burnBlockHeight,
                  }),
                  observedAt,
                  ageSeconds: getAgeSeconds(observedAt, nowMs),
                };
              })()
            : null;

          const blockResponse = latestResponse
            ? (() => {
                const observedAt = getObservedAt(latestResponse.id);
                return {
                  blockHash: latestResponse.signerSignatureHash,
                  signerPublicKey: latestResponse.signerPublicKey,
                  accepted: latestResponse.accepted,
                  rejectReason: latestResponse.rejectReason ?? null,
                  reason: latestResponse.reason ?? null,
                  latencyMs: latestResponse.latencyMs ?? null,
                  blockHeight: latestResponse.blockHeight ?? null,
                  observedAt,
                  ageSeconds: getAgeSeconds(observedAt, nowMs),
                };
              })()
            : null;

          const blockPush = latestPush
            ? (() => {
                const observedAt = getObservedAt(latestPush.id);
                return {
                  blockHash: latestPush.signerSignatureHash,
                  blockHeight: latestPush.chainLength,
                  minerPublicKey: latestPush.minerPublicKey,
                  observedAt,
                  ageSeconds: getAgeSeconds(observedAt, nowMs),
                };
              })()
            : null;

          const bitcoinBlock = latestBitcoin
            ? (() => {
                const observedAt = getObservedAt(latestBitcoin.id);
                return {
                  bitcoinBlockHash: latestBitcoin.burnBlockHash,
                  bitcoinBlockHeight: latestBitcoin.burnBlockHeight,
                  consensusHash: latestBitcoin.consensusHash,
                  observedAt,
                  ageSeconds: getAgeSeconds(observedAt, nowMs),
                };
              })()
            : null;

          const stateMachineUpdate = latestStateMachine
            ? (() => {
                const observedAt = getObservedAt(latestStateMachine.id);
                const update = serializeStateMachineUpdate(latestStateMachine);
                const minerState = update.minerState;
                const miner =
                  minerState.variant === 0
                    ? { status: 'none' }
                    : {
                        currentMinerPkh: minerState.currentMinerPkh,
                        tenureId: minerState.tenureId,
                        parentTenureId: minerState.parentTenureId,
                        parentTenureLastBlockHeight:
                          minerState.parentTenureLastBlockHeight,
                      };
                return {
                  signerPublicKey: update.signerPublicKey,
                  consensusHash: update.burnBlock,
                  bitcoinBlockHeight: update.burnBlockHeight,
                  activeSignerProtocolVersion:
                    update.activeSignerProtocolVersion,
                  localSignerProtocolVersion: update.localSignerProtocolVersion,
                  miner,
                  observedAt,
                  ageSeconds: getAgeSeconds(observedAt, nowMs),
                };
              })()
            : null;

          return {
            now: new Date(nowMs).toISOString(),
            latest: {
              stacksBlock,
              blockProposal,
              blockResponse,
              blockPush,
              bitcoinBlock,
              stateMachineUpdate,
            },
          };
        })
      );
    }
  );

  server.registerTool(
    'getRecentBlockHealth',
    {
      description:
        'Summarize recent signer acceptance/rejection ratios and pending blocks.',
      inputSchema: {
        limit: z
          .number()
          .int()
          .min(1)
          .max(200)
          .optional()
          .describe(
            'How many recent proposals to analyze (default 25, max 200)'
          ),
        includeBlocks: z
          .boolean()
          .optional()
          .describe('Include per-block summaries (default false)'),
      },
      outputSchema: getRecentBlockHealthOutputSchema,
    },
    (args) => {
      return runMcpEffect(
        // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: its ok
        Effect.gen(function* () {
          const db = yield* DbService;
          const nowMs = Date.now();
          const limit = Math.min(args.limit ?? 25, MAX_LIMIT);
          const stackerSet = yield* getStackers();

          const proposals = yield* db.withDb((db) =>
            db
              .select({
                id: blockProposals.id,
                signerSignatureHash: blockProposals.signerSignatureHash,
                indexBlockHash: blockProposals.indexBlockHash,
                chainLength: blockProposals.chainLength,
                burnBlockHeight: blockProposals.burnBlockHeight,
                consensusHash: blockProposals.consensusHash,
                blockTimestamp: blockProposals.blockTimestamp,
                minerPublicKey: blockProposals.minerPublicKey,
              })
              .from(blockProposals)
              .where(eq(blockProposals.networkKey, 'mainnet'))
              .orderBy(desc(blockProposals.id))
              .limit(limit)
          );

          if (proposals.length === 0) {
            return {
              window: { limit, blockCount: 0 },
              ratios: { accepted: 0, rejected: 0, pending: 0 },
              averages: {
                acceptRatio: 0,
                rejectRatio: 0,
                pendingRatio: 0,
                timeToPushedSeconds: 0,
              },
            };
          }

          const blockHashes = proposals.map((p) => p.signerSignatureHash);

          const [responses, pushes] = yield* Effect.all(
            [
              db.withDb((db) =>
                db
                  .select()
                  .from(blockResponses)
                  .where(
                    and(
                      eq(blockResponses.networkKey, 'mainnet'),
                      inArray(blockResponses.signerSignatureHash, blockHashes)
                    )
                  )
                  .orderBy(desc(blockResponses.id))
              ),
              db.withDb((db) =>
                db
                  .select({
                    id: blockPushes.id,
                    signerSignatureHash: blockPushes.signerSignatureHash,
                  })
                  .from(blockPushes)
                  .where(
                    and(
                      eq(blockPushes.networkKey, 'mainnet'),
                      inArray(blockPushes.signerSignatureHash, blockHashes)
                    )
                  )
                  .orderBy(desc(blockPushes.id))
              ),
            ],
            { concurrency: 'unbounded' }
          );

          const responsesByBlock = new Map<string, typeof responses>();
          for (const response of responses) {
            const list =
              responsesByBlock.get(response.signerSignatureHash) ?? [];
            list.push(response);
            responsesByBlock.set(response.signerSignatureHash, list);
          }

          const pushesByBlock = new Map<string, string>();
          for (const push of pushes) {
            pushesByBlock.set(push.signerSignatureHash, push.id);
          }

          const blocks = proposals.map((proposal) => {
            const observedAt = getObservedAt(proposal.id);
            const responseInfo = mapSignerDataToResponses({
              stackerSet,
              responses:
                responsesByBlock.get(proposal.signerSignatureHash) ?? [],
            });
            const pendingRatio =
              1 - responseInfo.acceptRatio - responseInfo.rejectRatio;
            const countPending =
              responseInfo.signers.length -
              responseInfo.countAccepted -
              responseInfo.countRejected;
            const pushedId = pushesByBlock.get(proposal.signerSignatureHash);
            const pushedAt = pushedId ? getObservedAt(pushedId) : null;
            const pushedAfterSeconds = pushedAt
              ? Math.max(
                  0,
                  Math.floor(
                    (new Date(pushedAt).getTime() -
                      new Date(observedAt).getTime()) /
                      1000
                  )
                )
              : null;
            const ageSeconds = getAgeSeconds(observedAt, nowMs);
            return {
              ...formatBitcoinFields({
                blockHash: proposal.signerSignatureHash,
                indexBlockHash: proposal.indexBlockHash,
                consensusHash: proposal.consensusHash,
                blockHeight: proposal.chainLength,
                blockTimestamp: proposal.blockTimestamp.toISOString(),
                observedAt,
                minerPublicKey: proposal.minerPublicKey,
                accepted: responseInfo.accepted,
                acceptRatio: responseInfo.acceptRatio,
                rejectRatio: responseInfo.rejectRatio,
                pendingRatio,
                countAccepted: responseInfo.countAccepted,
                countRejected: responseInfo.countRejected,
                countPending,
                pushedAt,
                pushedAfterSeconds,
                burnBlockHeight: proposal.burnBlockHeight,
              }),
              ageSeconds,
            };
          });

          const resolvedBlocks = blocks.filter((b) => b.accepted !== null);
          const acceptedBlocks = resolvedBlocks.filter((b) => b.accepted);
          const rejectedBlocks = resolvedBlocks.filter(
            (b) => b.accepted === false
          );
          const pendingBlocks = blocks.filter((b) => b.accepted === null);

          const oldestPending =
            pendingBlocks
              .map((block) => ({
                blockHash: block.blockHash,
                ageSeconds: block.ageSeconds,
              }))
              .sort((a, b) => b.ageSeconds - a.ageSeconds)[0] ?? null;

          const timeToPushedSeconds = blocks
            .map((block) => block.pushedAfterSeconds)
            .filter((value) => typeof value === 'number') as number[];

          return {
            window: {
              limit,
              blockCount: blocks.length,
              resolvedCount: resolvedBlocks.length,
              pendingCount: pendingBlocks.length,
            },
            ratios: {
              accepted: resolvedBlocks.length
                ? acceptedBlocks.length / resolvedBlocks.length
                : 0,
              rejected: resolvedBlocks.length
                ? rejectedBlocks.length / resolvedBlocks.length
                : 0,
              pending: blocks.length ? pendingBlocks.length / blocks.length : 0,
            },
            averages: {
              acceptRatio: average(blocks.map((b) => b.acceptRatio)),
              rejectRatio: average(blocks.map((b) => b.rejectRatio)),
              pendingRatio: average(blocks.map((b) => b.pendingRatio)),
              timeToPushedSeconds: average(timeToPushedSeconds),
            },
            oldestPending,
            blocks: args.includeBlocks ? blocks : undefined,
          };
        })
      );
    }
  );

  server.registerTool(
    'getSignerHealth',
    {
      description:
        'Compute signer participation and degradation over recent blocks.',
      inputSchema: {
        limit: z
          .number()
          .int()
          .min(1)
          .max(200)
          .optional()
          .describe(
            'How many recent proposals to analyze (default 50, max 200)'
          ),
        top: z
          .number()
          .int()
          .min(1)
          .max(200)
          .optional()
          .describe('Max signers to return (default 15, max 200)'),
      },
      outputSchema: getSignerHealthOutputSchema,
    },
    (args) => {
      return runMcpEffect(
        // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: its ok
        Effect.gen(function* () {
          const db = yield* DbService;
          const limit = Math.min(args.limit ?? 50, MAX_LIMIT);
          const top = Math.min(args.top ?? 15, MAX_LIMIT);
          const stackerSet = yield* getStackers();

          const proposals = yield* db.withDb((db) =>
            db
              .select({
                id: blockProposals.id,
                signerSignatureHash: blockProposals.signerSignatureHash,
                chainLength: blockProposals.chainLength,
              })
              .from(blockProposals)
              .where(eq(blockProposals.networkKey, 'mainnet'))
              .orderBy(desc(blockProposals.id))
              .limit(limit)
          );

          if (proposals.length === 0) {
            return JSON.stringify({
              window: { limit, blockCount: 0 },
              weightDegradedRatio: 0,
              signers: [],
            });
          }

          const blockHashes = proposals.map((p) => p.signerSignatureHash);

          const responses = yield* db.withDb((db) =>
            db
              .select()
              .from(blockResponses)
              .where(
                and(
                  eq(blockResponses.networkKey, 'mainnet'),
                  inArray(blockResponses.signerSignatureHash, blockHashes)
                )
              )
              .orderBy(desc(blockResponses.id))
          );

          const responsesByBlock = new Map<string, typeof responses>();
          for (const response of responses) {
            const list =
              responsesByBlock.get(response.signerSignatureHash) ?? [];
            list.push(response);
            responsesByBlock.set(response.signerSignatureHash, list);
          }

          const signerStats = new Map<
            string,
            {
              signerPublicKey: string;
              name: string | null;
              weightPercent: number;
              signedCount: number;
              acceptedCount: number;
              rejectedCount: number;
              missedCount: number;
              degradedCount: number;
            }
          >();

          let totalWeightDegraded = 0;
          const blockCount = proposals.length;
          for (const proposal of proposals) {
            const responseInfo = mapSignerDataToResponses({
              stackerSet,
              responses:
                responsesByBlock.get(proposal.signerSignatureHash) ?? [],
            });
            for (const signer of responseInfo.signers) {
              const existing = signerStats.get(signer.signing_key) ?? {
                signerPublicKey: signer.signing_key,
                name: signer.name ?? null,
                weightPercent: signer.weightPercent,
                signedCount: 0,
                acceptedCount: 0,
                rejectedCount: 0,
                missedCount: 0,
                degradedCount: 0,
              };
              if (signer.accepted === null) {
                existing.missedCount += 1;
              } else {
                existing.signedCount += 1;
                if (signer.accepted) {
                  existing.acceptedCount += 1;
                } else {
                  existing.rejectedCount += 1;
                }
              }
              if (
                signer.accepted === null ||
                (signer.accepted === false && responseInfo.accepted === true)
              ) {
                existing.degradedCount += 1;
                totalWeightDegraded += signer.weight;
              }
              signerStats.set(signer.signing_key, existing);
            }
          }

          const signers = Array.from(signerStats.values())
            .map((signer) => ({
              signerPublicKey: signer.signerPublicKey,
              name: signer.name,
              weightPercent: signer.weightPercent,
              participationRate: blockCount
                ? signer.signedCount / blockCount
                : 0,
              degradationRate: blockCount
                ? signer.degradedCount / blockCount
                : 0,
              signedCount: signer.signedCount,
              missedCount: signer.missedCount,
              acceptedCount: signer.acceptedCount,
              rejectedCount: signer.rejectedCount,
              degradedCount: signer.degradedCount,
            }))
            .sort(
              (a, b) =>
                b.degradationRate - a.degradationRate ||
                b.weightPercent - a.weightPercent
            )
            .slice(0, top);

          const weightDegradedRatio = blockCount
            ? totalWeightDegraded / (stackerSet.totalWeight * blockCount)
            : 0;

          return {
            window: { limit, blockCount, top },
            weightDegradedRatio,
            signers,
          };
        })
      );
    }
  );

  server.registerTool(
    'getLatestSignerResponses',
    {
      description:
        'List latest signer responses with optional filtering for missing/accepted/rejected.',
      inputSchema: {
        filter: z
          .enum(['all', 'accepted', 'rejected', 'missing'])
          .optional()
          .describe('Which signers to return (default all)'),
        limit: z
          .number()
          .int()
          .min(1)
          .max(200)
          .optional()
          .describe('Max signers to return (default 200)'),
      },
      outputSchema: getLatestSignerResponsesOutputSchema,
    },
    (args) => {
      return runMcpEffect(
        Effect.gen(function* () {
          const nowMs = Date.now();
          const filter = args.filter ?? 'all';
          const limit = Math.min(args.limit ?? MAX_LIMIT, MAX_LIMIT);
          const latest = yield* Effect.promise(() =>
            getLatestResponses('mainnet')
          );

          const responses = latest.responses.map((response) => {
            const observedAt = response.id ? getObservedAt(response.id) : null;
            return {
              signerPublicKey:
                response.signerPublicKey ?? response.signing_key ?? '',
              name: response.name ?? response.label ?? null,
              weightPercent: response.weightPercent,
              blockHash: response.signerSignatureHash,
              blockHeight: response.blockHeight ?? null,
              accepted: response.accepted ?? null,
              latencyMs: response.latencyMs ?? null,
              version: response.version ?? null,
              observedAt,
              ageSeconds: observedAt ? getAgeSeconds(observedAt, nowMs) : null,
            };
          });

          const responseKeys = new Set(
            responses.map((response) => response.signerPublicKey)
          );
          const missing = latest.signers
            .filter((signer) => !responseKeys.has(signer.signing_key))
            .map((signer) => ({
              signerPublicKey: signer.signing_key,
              name: signer.name ?? null,
              weightPercent: signer.weightPercent,
              missing: true,
            }));

          const filtered =
            filter === 'missing'
              ? missing
              : responses.filter((response) => {
                  if (filter === 'accepted') return response.accepted === true;
                  if (filter === 'rejected') return response.accepted === false;
                  return true;
                });

          return {
            filter,
            counts: {
              totalSigners: latest.signers.length,
              responses: responses.length,
              missing: missing.length,
            },
            responses: filtered.slice(0, limit),
          };
        })
      );
    }
  );

  server.registerTool(
    'getLatestStateMachines',
    {
      description: 'List the latest state machine update per signer.',
      inputSchema: {
        limit: z
          .number()
          .int()
          .min(1)
          .max(500)
          .optional()
          .describe('Max signers to return (default 100)'),
      },
      outputSchema: getLatestStateMachinesOutputSchema,
    },
    (args) => {
      return runMcpEffect(
        Effect.gen(function* () {
          const db = yield* DbService;
          const nowMs = Date.now();
          const limit = Math.min(args.limit ?? 100, 500);
          const updates = yield* db.withDb((db) =>
            db
              .select()
              .from(stateMachineUpdates)
              .where(eq(stateMachineUpdates.networkKey, 'mainnet'))
              .orderBy(desc(stateMachineUpdates.id))
              .limit(1000)
          );

          const latestBySigner = new Map<string, (typeof updates)[number]>();
          for (const update of updates) {
            if (!latestBySigner.has(update.signerPublicKey)) {
              latestBySigner.set(update.signerPublicKey, update);
            }
          }

          const items = Array.from(latestBySigner.values())
            .slice(0, limit)
            .map((update) => {
              const observedAt = getObservedAt(update.id);
              const serialized = serializeStateMachineUpdate(update);
              const minerState = serialized.minerState;
              const miner =
                minerState.variant === 0
                  ? { status: 'none' }
                  : {
                      currentMinerPkh: minerState.currentMinerPkh,
                      tenureId: minerState.tenureId,
                      parentTenureId: minerState.parentTenureId,
                      parentTenureLastBlockHeight:
                        minerState.parentTenureLastBlockHeight,
                    };
              return {
                signerPublicKey: serialized.signerPublicKey,
                consensusHash: serialized.burnBlock,
                bitcoinBlockHeight: serialized.burnBlockHeight,
                activeSignerProtocolVersion:
                  serialized.activeSignerProtocolVersion,
                localSignerProtocolVersion:
                  serialized.localSignerProtocolVersion,
                miner,
                observedAt,
                ageSeconds: getAgeSeconds(observedAt, nowMs),
              };
            });

          return {
            count: items.length,
            stateMachines: items,
          };
        })
      );
    }
  );

  server.registerTool(
    'getTenureBlocks',
    {
      description:
        'List Stacks block proposals for a tenure by consensus hash or Bitcoin block identifier.',
      inputSchema: {
        consensusHash: z
          .string()
          .optional()
          .describe('The consensus hash for the tenure'),
        bitcoinBlockHash: z
          .string()
          .optional()
          .describe('The Bitcoin block hash (burn header hash)'),
        bitcoinBlockHeight: z
          .number()
          .int()
          .optional()
          .describe('The Bitcoin block height'),
        limit: z
          .number()
          .int()
          .min(1)
          .max(200)
          .optional()
          .describe('Max proposals to return (default 200)'),
      },
      outputSchema: getTenureBlocksOutputSchema,
    },
    (args) => {
      return runMcpEffect(
        Effect.gen(function* () {
          const db = yield* DbService;
          const lookups = getSortitionLookupCount(args);
          if (lookups !== 1) {
            return 'Provide exactly one of consensusHash, bitcoinBlockHash, or bitcoinBlockHeight.';
          }

          let consensusHash = args.consensusHash ?? null;
          let bitcoinBlockHeight = args.bitcoinBlockHeight ?? null;
          let bitcoinBlockHash = args.bitcoinBlockHash ?? null;

          if (!consensusHash) {
            const [burnBlock] = yield* db.withDb((db) =>
              db
                .select()
                .from(burnBlocks)
                .where(
                  and(
                    eq(burnBlocks.networkKey, 'mainnet'),
                    typeof args.bitcoinBlockHash === 'string'
                      ? eq(burnBlocks.burnBlockHash, args.bitcoinBlockHash)
                      : undefined,
                    typeof args.bitcoinBlockHeight === 'number'
                      ? eq(burnBlocks.burnBlockHeight, args.bitcoinBlockHeight)
                      : undefined
                  )
                )
                .orderBy(desc(burnBlocks.id))
                .limit(1)
            );
            if (!burnBlock) {
              return 'No Bitcoin block found';
            }
            consensusHash = burnBlock.consensusHash;
            bitcoinBlockHeight = burnBlock.burnBlockHeight;
            bitcoinBlockHash = burnBlock.burnBlockHash;
          }

          const limit = Math.min(args.limit ?? 200, MAX_LIMIT);

          const proposals = yield* db.withDb((db) =>
            db
              .select({
                id: blockProposals.id,
                signerSignatureHash: blockProposals.signerSignatureHash,
                indexBlockHash: blockProposals.indexBlockHash,
                chainLength: blockProposals.chainLength,
                blockTimestamp: blockProposals.blockTimestamp,
                minerPublicKey: blockProposals.minerPublicKey,
                burnBlockHeight: blockProposals.burnBlockHeight,
                stacksBlockHash: stacksBlocks.blockHash,
                stacksBlockHeight: stacksBlocks.blockHeight,
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
              .where(
                and(
                  eq(blockProposals.networkKey, 'mainnet'),
                  eq(blockProposals.consensusHash, consensusHash)
                )
              )
              .orderBy(
                desc(blockProposals.chainLength),
                desc(blockProposals.id)
              )
              .limit(limit)
          );

          const items = proposals.map((proposal) => {
            const accepted = Boolean(proposal.stacksBlockHash);
            return formatBitcoinFields({
              blockHash: proposal.signerSignatureHash,
              indexBlockHash: proposal.indexBlockHash,
              blockHeight: proposal.chainLength,
              blockTimestamp: proposal.blockTimestamp.toISOString(),
              observedAt: getObservedAt(proposal.id),
              minerPublicKey: proposal.minerPublicKey,
              accepted,
              stacksBlockHash: accepted ? proposal.stacksBlockHash : null,
              stacksBlockHeight: accepted ? proposal.stacksBlockHeight : null,
              burnBlockHeight: proposal.burnBlockHeight,
            });
          });

          return {
            consensusHash,
            bitcoinBlockHeight,
            bitcoinBlockHash,
            blocks: items,
          };
        })
      );
    }
  );

  server.registerTool(
    'getTenure',
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
      outputSchema: getTenureOutputSchema,
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

          return {
            tenure: formatSortition(sortition),
          };
        })
      );
    }
  );

  return server;
};
