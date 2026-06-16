import {
  getStackerSet as getStackerSetInner,
  getPoxInfo as getPoxInfoInner,
  type StackerSetSigner,
  getApiUrl,
  percentString,
  knownSigners,
} from 'slot-watch-common';
import { memoizeCache } from './cache';
import { stxCommittedCache } from './pox-4';
import {
  fetchRecentMinerBlocksCache,
  recentBlocksHealthCache,
} from './db/block-proposals';
import type { Db } from './db/db';
import { env } from 'cloudflare:workers';

const getStackerSetCache = memoizeCache(
  (networkKey: string, rewardCycle: number) =>
    `stacker_set_${getApiUrl(networkKey)}_${rewardCycle}_v2`,
  (networkKey: string, rewardCycle: number) =>
    getStackerSetInner(networkKey, rewardCycle, env.HIRO_API_KEY)
);

const getLatestStackerSetCache = memoizeCache(
  (networkKey: string) => `stacker_set_latest_v2_${networkKey}`,
  async (networkKey: string) => {
    const poxInfo = await getPoxInfo.get(networkKey);
    return getStackerSetCache.get(networkKey, poxInfo.rewardCycleId);
  }
);

export type StackerSet = Awaited<ReturnType<typeof getStackerSet>>;

function mapCachedSignerData(signers: StackerSetSigner[]) {
  const signersByKey = new Map<string, StackerSetSigner>();
  for (const signer of signers) {
    signersByKey.set(signer.signing_key, signer);
  }
  const totalWeight = signers.reduce((acc, signer) => acc + signer.weight, 0);

  const signersExtra = signers.map((signer, i) => {
    const weightPercent = signer.weight / totalWeight;
    const percentStr = percentString(weightPercent);
    let label = '';
    const name = knownSigners[signer.signing_key];
    if (typeof name === 'undefined') {
      label += `#${i}`;
    } else {
      label += name;
    }
    label += ` (${percentStr}%)`;
    return {
      ...signer,
      publicKey: signer.signing_key,
      weightPercent,
      weightPercentStr: percentStr,
      name,
      label,
    };
  });

  return {
    signers: signersExtra,
    signersByKey,
    totalWeight,
  };
}

export async function getStackerSet(networkKey: string, rewardCycle: number) {
  const signers = await getStackerSetCache.get(networkKey, rewardCycle);
  return mapCachedSignerData(signers);
}

export async function getLatestStackerSet(networkKey: string) {
  const signers = await getLatestStackerSetCache.get(networkKey);
  return mapCachedSignerData(signers);
}

async function getSmallPoxInfo(networkKey: string) {
  const poxInfo = await getPoxInfoInner(networkKey, env.HIRO_API_KEY);
  if (!poxInfo.reward_cycle_id) {
    throw new Error('No reward cycle id');
  }
  return {
    firstBurnchainBlockHeight: poxInfo.first_burnchain_block_height,
    rewardCycleLength: poxInfo.reward_cycle_length,
    rewardCycleId: poxInfo.reward_cycle_id,
  };
}
export const getPoxInfo = memoizeCache(
  (networkKey: string) => `pox_info_${getApiUrl(networkKey)}`,
  getSmallPoxInfo
);

export async function warmCache(networkKey: string, db: Db) {
  const poxInfo = await getPoxInfo.warm(networkKey);
  const rewardCycle = poxInfo.rewardCycleId;
  await getStackerSetCache.warm(networkKey, rewardCycle);
  await Promise.all([
    stxCommittedCache.warm(),
    fetchRecentMinerBlocksCache.warm(networkKey, db),
    recentBlocksHealthCache.warmIfNeeded(db),
    // warmupMetrics(),
  ]);
}
