import { db } from './db';
import { eq, desc, and, inArray, getTableColumns, gte, lte } from 'drizzle-orm';
import {
  blockPushes,
  blockProposals as blockProposalsSchema,
  blockResponses as blockResponsesSchema,
  type BlockResponseDb,
  type BlockProposalDb,
} from './schema';
import { getPoxInfo, getStackerSet } from '../stacks-api';
import { mapSignerDataToResponses } from './block-responses';
import { getVersionFromString, type ApiBlockProposal } from 'slot-watch-common';
import { redisClient } from '../redis';
import { parse, stringify } from 'superjson';
import { logger } from '../logger';

export function serializeBlockProposal(
  block: BlockProposalDb,
): ApiBlockProposal {
  return {
    ...block,
    createdAt: block.createdAt.toISOString(),
    burnBlockHeight: block.burnBlockHeight ?? 0,
    consensusHash: block.consensusHash ?? '',
    minerPublicKey: block.minerPublicKey ?? '',
    txCount: block.txCount ?? 0,
    serverVersionShort: block.serverVersion
      ? getVersionFromString(block.serverVersion)
      : null,
    serverVersion: block.serverVersion ?? null,
    blockTimestamp: (block.blockTimestamp || block.createdAt).toISOString(),
  };
}

const LAST_BLOCK_PROPOSAL_KEY = 'last-block-proposal';

export function latestBlockProposalLookupKey({
  minerPublicKey,
  networkKey,
}: { minerPublicKey: string; networkKey: string }) {
  return `${LAST_BLOCK_PROPOSAL_KEY}:${networkKey}:${minerPublicKey}`;
}

export async function getAllLatestBlockProposals(
  networkKey: string,
): Promise<ApiBlockProposal[]> {
  const keys = await redisClient.keys(
    `${LAST_BLOCK_PROPOSAL_KEY}:${networkKey}:*`,
  );
  const results = await redisClient.mget(keys);
  return results
    .filter((result): result is string => result !== null)
    .map(parseBlockProposal)
    .filter((proposal): proposal is ApiBlockProposal => proposal !== null);
}

function parseBlockProposal(result: string) {
  try {
    const parsed = parse(result);
    return parsed as ApiBlockProposal;
  } catch (error) {
    logger.error(
      { topic: 'block-proposal', error },
      'Error parsing block proposal from Redis',
    );
    return null;
  }
}

export async function getLatestBlockProposal(
  minerPublicKey: string,
  networkKey: string,
) {
  const key = latestBlockProposalLookupKey({ minerPublicKey, networkKey });
  const result = await redisClient.get(key);
  logger.debug(
    {
      topic: 'block-proposal',
      key,
      hasResult: result !== null,
    },
    'getting latest block proposal',
  );
  if (result === null) return null;
  return parseBlockProposal(result);
}

export async function setLatestBlockProposal(blockProposal: ApiBlockProposal) {
  if (!blockProposal.minerPublicKey) return;
  const key = latestBlockProposalLookupKey({
    minerPublicKey: blockProposal.minerPublicKey,
    networkKey: blockProposal.networkKey,
  });
  logger.debug(
    {
      topic: 'block-proposal',
      key,
      networkKey: blockProposal.networkKey,
      minerPublicKey: blockProposal.minerPublicKey,
    },
    'setting latest block proposal',
  );
  await redisClient.set(key, stringify(blockProposal));
}

export async function getCachedLatestBlockProposals(
  networkKey: string,
  minerPublicKeys: string[],
) {
  const keys = minerPublicKeys.map((minerPublicKey) =>
    latestBlockProposalLookupKey({ minerPublicKey, networkKey }),
  );
  const results = await redisClient.mget(keys);
  logger.debug(
    {
      topic: 'block-proposal',
      resultsLength: results.length,
      keysLength: keys.length,
      networkKey,
    },
    'getting latest block proposals',
  );
  const blockProposals = results
    .map((result) => (result ? parseBlockProposal(result) : null))
    .filter((r) => r !== null) as ApiBlockProposal[];
  return blockProposals;
}

export async function getRecentBlocksHealth({
  networkKey,
  from,
  to,
}: { networkKey: string; from?: number; to?: number }) {
  const { rewardCycleId } = await getPoxInfo.get(networkKey);
  const stackerSet = await getStackerSet(networkKey, rewardCycleId);

  const recentBlocks = await db
    .select({
      ...getTableColumns(blockProposalsSchema),
      pushedAt: blockPushes.createdAt,
    })
    .from(blockProposalsSchema)
    .where(
      and(
        eq(blockProposalsSchema.networkKey, networkKey),
        from ? gte(blockProposalsSchema.chainLength, from) : undefined,
        to ? lte(blockProposalsSchema.chainLength, to) : undefined,
      ),
    )
    .leftJoin(
      blockPushes,
      and(
        eq(
          blockProposalsSchema.signerSignatureHash,
          blockPushes.signerSignatureHash,
        ),
        eq(blockPushes.networkKey, blockProposalsSchema.networkKey),
      ),
    )
    .orderBy(
      desc(blockProposalsSchema.chainLength),
      desc(blockProposalsSchema.createdAt),
    )
    .limit(50);

  const blockResponses = await db
    .select()
    .from(blockResponsesSchema)
    .where(
      and(
        eq(blockResponsesSchema.networkKey, networkKey),
        inArray(
          blockResponsesSchema.signerSignatureHash,
          recentBlocks.map((b) => b.signerSignatureHash),
        ),
      ),
    )
    .orderBy(desc(blockResponsesSchema.createdAt));

  const responsesByBlock = new Map<string, BlockResponseDb[]>();

  for (const response of blockResponses) {
    const block = responsesByBlock.get(response.signerSignatureHash) ?? [];
    block.push(response);
    responsesByBlock.set(response.signerSignatureHash, block);
  }

  const blocksWithInfo = recentBlocks.map((b) => {
    const responses = responsesByBlock.get(b.signerSignatureHash) ?? [];
    const responseInfo = mapSignerDataToResponses({
      stackerSet: stackerSet,
      responses,
    });
    const weightPending =
      responseInfo.totalWeight -
      responseInfo.weightAccept -
      responseInfo.weightReject;
    const countPending =
      responseInfo.signers.length -
      responseInfo.countAccepted -
      responseInfo.countRejected;
    const pendingRatio = weightPending / responseInfo.totalWeight;
    return {
      ...b,
      ...responseInfo,
      countPending,
      pendingRatio,
      weightPending,
    };
  });

  return {
    blocks: blocksWithInfo,
  };
}
