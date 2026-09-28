import type { Db } from './db';
import {
  eq,
  asc,
  desc,
  and,
  exists,
  inArray,
  getTableColumns,
  gte,
  lte,
  sql,
} from 'drizzle-orm';
import {
  blockPushes,
  blockPreCommits as blockPreCommitsSchema,
  blockProposals as blockProposalsSchema,
  blockResponses as blockResponsesSchema,
  type BlockPreCommitDb,
  type BlockResponseDb,
  type BlockProposalDb,
  blockProposals,
  burnBlocks,
  stacksBlocks,
} from './schema';
import { getPoxInfo, getStackerSet } from '../stacks-api';
import { mapSignerDataToResponses } from './block-responses';
import { getVersionFromString, type ApiBlockProposal } from 'slot-watch-common';
import { stringify } from 'superjson';
import { logger } from '../logger';
import { memoizeCache } from '../cache';
import { env } from 'cloudflare:workers';
import { getCreatedAt } from '../utils';
import * as R from 'remeda';
import { serializeBlockProposal } from './serializers';

const LAST_BLOCK_PROPOSAL_KEY = 'last-block-proposal';

function latestBlockProposalLookupKey({
  minerPublicKey,
  networkKey,
}: {
  minerPublicKey: string;
  networkKey: string;
}) {
  return `${LAST_BLOCK_PROPOSAL_KEY}:${networkKey}:${minerPublicKey}`;
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
    'setting latest block proposal'
  );
  await env.CACHE.put(key, stringify(blockProposal));
}

export async function getRecentBlocksHealth({
  networkKey,
  from,
  to,
  db,
}: {
  networkKey: string;
  from?: number;
  to?: number;
  db: Db;
}) {
  const { rewardCycleId } = await getPoxInfo.get(networkKey);
  const stackerSet = await getStackerSet(networkKey, rewardCycleId);

  const recentBlocks = await db
    .selectDistinctOn([blockProposalsSchema.chainLength], {
      ...getTableColumns(blockProposalsSchema),
      pushedAt: blockPushes.id,
    })
    .from(blockProposalsSchema)
    .where(
      and(
        eq(blockProposalsSchema.networkKey, networkKey),
        from ? gte(blockProposalsSchema.chainLength, from) : undefined,
        to ? lte(blockProposalsSchema.chainLength, to) : undefined
      )
    )
    .leftJoin(
      blockPushes,
      and(
        eq(
          blockProposalsSchema.signerSignatureHash,
          blockPushes.signerSignatureHash
        ),
        eq(blockPushes.networkKey, blockProposalsSchema.networkKey)
      )
    )
    .orderBy(
      desc(blockProposalsSchema.chainLength),
      desc(blockProposalsSchema.id)
    )
    .offset(50)
    .limit(50);

  const blockHashes = recentBlocks.map((b) => b.signerSignatureHash);

  // Two batched queries (never per-block): responses and pre-commits for the
  // same window of proposals.
  const [blockResponses, preCommits] = await Promise.all([
    db
      .select()
      .from(blockResponsesSchema)
      .where(
        and(
          eq(blockResponsesSchema.networkKey, networkKey),
          inArray(blockResponsesSchema.signerSignatureHash, blockHashes)
        )
      )
      .orderBy(desc(blockResponsesSchema.id)),
    db
      .select()
      .from(blockPreCommitsSchema)
      .where(
        and(
          eq(blockPreCommitsSchema.networkKey, networkKey),
          inArray(blockPreCommitsSchema.signerSignatureHash, blockHashes)
        )
      )
      // Ascending so consumers get first-pre-commit-wins and can accumulate
      // weight in observation order without re-sorting.
      .orderBy(asc(blockPreCommitsSchema.id)),
  ]);

  const responsesByBlock = new Map<string, BlockResponseDb[]>();

  for (const response of blockResponses) {
    const block = responsesByBlock.get(response.signerSignatureHash) ?? [];
    block.push(response);
    responsesByBlock.set(response.signerSignatureHash, block);
  }

  const preCommitsByBlock = new Map<string, BlockPreCommitDb[]>();

  for (const preCommit of preCommits) {
    const block = preCommitsByBlock.get(preCommit.signerSignatureHash) ?? [];
    block.push(preCommit);
    preCommitsByBlock.set(preCommit.signerSignatureHash, block);
  }

  const blocksWithInfo = recentBlocks.map((b) => {
    const responses = responsesByBlock.get(b.signerSignatureHash) ?? [];
    const blockPreCommits = preCommitsByBlock.get(b.signerSignatureHash) ?? [];
    const responseInfo = mapSignerDataToResponses({
      stackerSet,
      responses,
      preCommits: blockPreCommits,
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
    const pushedAt = b.pushedAt ? getCreatedAt(b.pushedAt) : null;
    return {
      ...b,
      ...responseInfo,
      countPending,
      pendingRatio,
      weightPending,
      pushedAt,
    };
  });

  return {
    blocks: blocksWithInfo,
  };
}

export const recentBlocksHealthCache = memoizeCache(
  () => 'recent-blocks-health:mainnet',
  // biome-ignore lint/suspicious/useAwait: ignored using `--suppress`
  async (db: Db) => {
    return getRecentBlocksHealth({ networkKey: 'mainnet', db });
  },
  {
    ttl: 60 * 5,
    refreshTtl: 60 * 1,
  }
);

async function _fetchRecentMinerBlocks(networkKey: string, db: Db) {
  const recentBlocks = await db
    .selectDistinctOn([blockProposals.burnBlockHeight], {
      burnBlockHeight: blockProposals.burnBlockHeight,
      chainLength: blockProposals.chainLength,
      id: blockProposals.id,
      minerPublicKey: blockProposals.minerPublicKey,
      serverVersion: blockProposals.serverVersion,
      blockTimestamp: blockProposals.blockTimestamp,
    })
    .from(blockProposals)
    .where(
      and(
        eq(blockProposals.networkKey, networkKey),
        exists(
          db
            .select({ one: sql`1` })
            .from(burnBlocks)
            .where(
              and(
                eq(burnBlocks.consensusHash, blockProposals.consensusHash),
                eq(burnBlocks.networkKey, networkKey)
              )
            )
        ),
        exists(
          db
            .select({ one: sql`1` })
            .from(stacksBlocks)
            .where(
              and(
                eq(stacksBlocks.consensusHash, blockProposals.consensusHash),
                eq(stacksBlocks.networkKey, networkKey)
              )
            )
        )
      )
    )
    .orderBy(
      desc(blockProposals.burnBlockHeight),
      desc(blockProposals.chainLength),
      desc(blockProposals.id)
    )
    .limit(500);

  return recentBlocks.map((block) => ({
    ...block,
    blockTimestamp: block.blockTimestamp.toISOString(),
  }));
}

export const fetchRecentMinerBlocksCache = memoizeCache(
  (networkKey: string) => `recent-miner-blocks-v4:${networkKey}`,
  // biome-ignore lint/suspicious/useAwait: ignored using `--suppress`
  async (networkKey: string, db: Db) => {
    return _fetchRecentMinerBlocks(networkKey, db);
  }
);

export const fetchRecentMinerStats = async (networkKey: string, db: Db) => {
  const recentBlocks = await fetchRecentMinerBlocksCache.get(networkKey, db);

  const miners: Record<
    string,
    {
      version: string;
      count: number;
      latestBlock: number;
      publicKey: string;
    }
  > = {};

  for (const block of recentBlocks) {
    const minerPublicKey = block.minerPublicKey ?? '';
    const serverVersion = block.serverVersion ?? '';
    const miner = miners[minerPublicKey] ?? {
      version: serverVersion,
      shortVersion: getVersionFromString(serverVersion),
      count: 0,
      latestBlock: block.burnBlockHeight,
      publicKey: minerPublicKey,
    };
    miners[minerPublicKey] = {
      ...miner,
      count: miner.count + 1,
    };
  }

  return {
    miners: Object.values(miners),
    // recentBlocks,
  };
};

export async function fetchBlockProposalsByHash(
  signerSignatureHash: string[],
  db: Db
) {
  const blockProposalsList = await db.query.blockProposals.findMany({
    where: (fields, operators) =>
      operators.inArray(fields.signerSignatureHash, signerSignatureHash),
  });
  return R.map(blockProposalsList, serializeBlockProposal);
}

type RecentMinerBlock = Awaited<ReturnType<typeof _fetchRecentMinerBlocks>>[0];

function buildVersionHistory(tenures: RecentMinerBlock[]) {
  const versionMap = new Map<
    string,
    { firstSeen: string; lastSeen: string; tenureCount: number }
  >();
  for (const tenure of tenures) {
    const version = tenure.serverVersion ?? 'Unknown';
    const timestamp = tenure.blockTimestamp;
    const existing = versionMap.get(version);
    if (existing) {
      existing.tenureCount++;
      if (timestamp < existing.firstSeen) existing.firstSeen = timestamp;
      if (timestamp > existing.lastSeen) existing.lastSeen = timestamp;
    } else {
      versionMap.set(version, {
        firstSeen: timestamp,
        lastSeen: timestamp,
        tenureCount: 1,
      });
    }
  }

  return Array.from(versionMap.entries())
    .map(([version, data]) => ({
      version,
      versionShort: getVersionFromString(version),
      ...data,
    }))
    .sort((a, b) => b.lastSeen.localeCompare(a.lastSeen));
}

export async function fetchMinerDetail(
  networkKey: string,
  publicKey: string,
  db: Db
) {
  const recentTenures = await fetchRecentMinerBlocksCache.get(networkKey, db);
  const minerTenures = recentTenures.filter(
    (tenure) => tenure.minerPublicKey === publicKey
  );
  const currentVersion = minerTenures[0]?.serverVersion ?? null;

  return {
    miner: {
      publicKey,
      stats: {
        last500: {
          tenuresWon: minerTenures.length,
          percentage:
            recentTenures.length > 0
              ? (minerTenures.length / recentTenures.length) * 100
              : 0,
        },
      },
      currentVersion,
      currentVersionShort: currentVersion
        ? getVersionFromString(currentVersion)
        : null,
      versionHistory: buildVersionHistory(minerTenures),
    },
  };
}
