import type { Db } from './db';
import {
  eq,
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
  blockProposals as blockProposalsSchema,
  blockResponses as blockResponsesSchema,
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

  const blockResponses = await db
    .select()
    .from(blockResponsesSchema)
    .where(
      and(
        eq(blockResponsesSchema.networkKey, networkKey),
        inArray(
          blockResponsesSchema.signerSignatureHash,
          recentBlocks.map((b) => b.signerSignatureHash)
        )
      )
    )
    .orderBy(desc(blockResponsesSchema.id));

  const responsesByBlock = new Map<string, BlockResponseDb[]>();

  for (const response of blockResponses) {
    const block = responsesByBlock.get(response.signerSignatureHash) ?? [];
    block.push(response);
    responsesByBlock.set(response.signerSignatureHash, block);
  }

  const blocksWithInfo = recentBlocks.map((b) => {
    const responses = responsesByBlock.get(b.signerSignatureHash) ?? [];
    const responseInfo = mapSignerDataToResponses({
      stackerSet,
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

  return recentBlocks;
}

export const fetchRecentMinerBlocksCache = memoizeCache(
  (networkKey: string) => `recent-miner-blocks-v3:${networkKey}`,
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

function buildVersionHistory(
  minerBlocks: Array<{ serverVersion: string | null; blockTimestamp: Date }>
) {
  const versionMap = new Map<
    string,
    { firstSeen: Date; lastSeen: Date; blockCount: number }
  >();
  for (const block of minerBlocks) {
    const version = block.serverVersion ?? 'Unknown';
    const existing = versionMap.get(version);
    const timestamp = block.blockTimestamp;
    if (existing) {
      existing.blockCount++;
      if (timestamp < existing.firstSeen) existing.firstSeen = timestamp;
      if (timestamp > existing.lastSeen) existing.lastSeen = timestamp;
    } else {
      versionMap.set(version, {
        firstSeen: timestamp,
        lastSeen: timestamp,
        blockCount: 1,
      });
    }
  }

  return Array.from(versionMap.entries())
    .map(([version, data]) => ({
      version,
      versionShort: getVersionFromString(version),
      firstSeen: data.firstSeen.toISOString(),
      lastSeen: data.lastSeen.toISOString(),
      blockCount: data.blockCount,
    }))
    .sort(
      (a, b) => new Date(b.lastSeen).getTime() - new Date(a.lastSeen).getTime()
    );
}

export async function fetchMinerDetail(
  networkKey: string,
  publicKey: string,
  db: Db
) {
  const minerBlocks = await db
    .select({
      burnBlockHeight: blockProposals.burnBlockHeight,
      chainLength: blockProposals.chainLength,
      signerSignatureHash: blockProposals.signerSignatureHash,
      blockTimestamp: blockProposals.blockTimestamp,
      serverVersion: blockProposals.serverVersion,
      txCount: blockProposals.txCount,
      id: blockProposals.id,
    })
    .from(blockProposals)
    .where(
      and(
        eq(blockProposals.networkKey, networkKey),
        eq(blockProposals.minerPublicKey, publicKey)
      )
    )
    .orderBy(desc(blockProposals.id))
    .limit(500);

  if (minerBlocks.length === 0) {
    return null;
  }

  const recentMinerBlocks = await fetchRecentMinerBlocksCache.get(
    networkKey,
    db
  );
  const totalRecentBlocks = recentMinerBlocks.length;
  const minerRecentCount = recentMinerBlocks.filter(
    (b) => b.minerPublicKey === publicKey
  ).length;

  const versionHistory = buildVersionHistory(minerBlocks);

  const latestBlock = minerBlocks[0];
  const currentVersion = latestBlock?.serverVersion ?? null;

  const recentBlocks = minerBlocks.slice(0, 50).map((block) => ({
    burnBlockHeight: block.burnBlockHeight,
    chainLength: block.chainLength,
    signerSignatureHash: block.signerSignatureHash,
    blockTimestamp: block.blockTimestamp.toISOString(),
    serverVersion: block.serverVersion,
    serverVersionShort: block.serverVersion
      ? getVersionFromString(block.serverVersion)
      : null,
    txCount: block.txCount,
  }));

  const oldestBlock = minerBlocks.at(-1);
  const firstSeen = oldestBlock?.blockTimestamp.toISOString() ?? null;

  return {
    miner: {
      publicKey,
      stats: {
        last500: {
          blocksWon: minerRecentCount,
          percentage:
            totalRecentBlocks > 0
              ? (minerRecentCount / totalRecentBlocks) * 100
              : 0,
        },
        allTime: {
          blocksWon: minerBlocks.length,
          firstSeen,
        },
      },
      currentVersion,
      currentVersionShort: currentVersion
        ? getVersionFromString(currentVersion)
        : null,
      versionHistory,
    },
    recentBlocks,
  };
}
