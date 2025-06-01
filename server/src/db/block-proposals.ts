import { db } from './db';
import {
  eq,
  desc,
  and,
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
// import { redisClient } from '../redis';
import { parse, stringify } from 'superjson';
import { logger } from '../logger';
import { memoizeCache } from '../cache';
import { env } from 'cloudflare:workers';
import { getCreatedAt } from '../utils';

export function serializeBlockProposal(
  block: BlockProposalDb,
): ApiBlockProposal {
  const createdAt = getCreatedAt(block.id);
  return {
    ...block,
    createdAt: createdAt.toISOString(),
    burnBlockHeight: block.burnBlockHeight ?? 0,
    consensusHash: block.consensusHash ?? '',
    minerPublicKey: block.minerPublicKey ?? '',
    txCount: block.txCount ?? 0,
    serverVersionShort: block.serverVersion
      ? getVersionFromString(block.serverVersion)
      : null,
    serverVersion: block.serverVersion ?? null,
    blockTimestamp: (block.blockTimestamp || createdAt).toISOString(),
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
  const keys = await env.CACHE.list({
    prefix: `${LAST_BLOCK_PROPOSAL_KEY}:${networkKey}:`,
  });
  const results = await env.CACHE.get(keys.keys.map((k) => k.name));
  return [...results.values()]
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
  const result = await env.CACHE.get(key);
  // const result = await redisClient.get(key);
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
  await env.CACHE.put(key, stringify(blockProposal));
  // await redisClient.set(key, stringify(blockProposal));
}

export async function getCachedLatestBlockProposals(
  networkKey: string,
  minerPublicKeys: string[],
) {
  const keys = minerPublicKeys.map((minerPublicKey) =>
    latestBlockProposalLookupKey({ minerPublicKey, networkKey }),
  );
  const results = await Promise.all(keys.map((key) => env.CACHE.get(key)));
  // const results = await redisClient.mGet(keys);
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
      pushedAt: blockPushes.id,
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
      desc(blockProposalsSchema.id),
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

export async function _fetchRecentMinerBlocks(networkKey: string) {
  const recentBlocksDistinct = await db
    .selectDistinct({
      burnBlockHeight: blockProposals.burnBlockHeight,
      chainLength: blockProposals.chainLength,
      id: blockProposals.id,
    })
    // .selectDistinctOn([blockProposals.burnBlockHeight], {
    //   chainLength: blockProposals.chainLength,
    //   minerPublicKey: blockProposals.minerPublicKey,
    //   serverVersion: blockProposals.serverVersion,
    //   burnBlockHeight: burnBlocks.burnBlockHeight,
    // })
    .from(blockProposals)
    .innerJoin(
      burnBlocks,
      and(
        eq(blockProposals.consensusHash, burnBlocks.consensusHash),
        eq(burnBlocks.networkKey, networkKey),
      ),
    )
    .innerJoin(
      stacksBlocks,
      and(
        eq(blockProposals.consensusHash, stacksBlocks.consensusHash),
        eq(stacksBlocks.networkKey, networkKey),
      ),
    )
    .where(eq(blockProposals.networkKey, networkKey))
    .orderBy(
      desc(blockProposals.burnBlockHeight),
      desc(blockProposals.chainLength),
      desc(blockProposals.id),
    )
    .limit(1000);

  const recentBlocks = await db
    .select({
      ...getTableColumns(blockProposalsSchema),
      pushedAt: blockPushes.id,
    })
    .from(blockProposalsSchema)
    .where(eq(blockProposalsSchema.networkKey, networkKey))
    .orderBy(
      desc(blockProposalsSchema.burnBlockHeight),
      desc(blockProposalsSchema.chainLength),
      desc(blockProposalsSchema.id),
    )
    .limit(1000);

  // const recentBlocks = await db.execute<{
  //   consensus_hash: string;
  //   burn_block_height: number;
  //   chain_length: number;
  //   signer_signature_hash: string;
  //   miner_public_key: string;
  //   server_version: string;
  // }>(sql`
  //   select
  //     distinct on (bb.burn_block_height) bb.consensus_hash
  //     , bp.chain_length
  //     , bp.signer_signature_hash
  //     , bb.burn_block_height
  //     , bp.miner_public_key
  //     , bp.server_version
  //   from block_proposals bp
  //   join burn_blocks bb on bb.consensus_hash = bp.consensus_hash and bb.network_key = ${networkKey}
  //   join stacks_blocks sb on sb.consensus_hash = bp.consensus_hash and sb.network_key = ${networkKey}
  //   order by bb.burn_block_height desc, bp.chain_length desc
  //   limit 1000;
  //   `);
  return recentBlocks;
}

const fetchRecentMinerBlocks = memoizeCache(
  (networkKey: string) => `recent-miner-blocks-v2:${networkKey}`,
  async (networkKey: string) => {
    return _fetchRecentMinerBlocks(networkKey);
  },
);

export const fetchRecentMinerStats = async (networkKey: string) => {
  const recentBlocks = await fetchRecentMinerBlocks.get(networkKey);

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
