import {
  getStackerSet as getStackerSetInner,
  getPoxInfo as getPoxInfoInner,
  type StackerSetSigner,
  getApiUrl,
  percentString,
  knownSigners,
} from 'slot-watch-common';
import { memoizeCache } from './cache';
import { warmupMetrics } from './metrics';
import { stxCommittedCache } from './pox-4';

export const getStackerSetCache = memoizeCache(
  (networkKey: string, rewardCycle: number) =>
    `stacker_set_${getApiUrl(networkKey)}_${rewardCycle}_v2`,
  getStackerSetInner,
);

export type StackerSet = Awaited<ReturnType<typeof getStackerSet>>;

export async function getStackerSet(networkKey: string, rewardCycle: number) {
  const signers = await getStackerSetCache.get(networkKey, rewardCycle);
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

// export async function _getStackerSet(networkKey: string, rewardCycle: number) {
// 	const cacheKey = `stacker_set_${networkKey}_${rewardCycle}`;
// 	const cached = cache.get<StackerSetCached>(cacheKey);
// 	if (cached) {
// 		return cached;
// 	}
// 	const result = await getStackerSetInner(networkKey, rewardCycle);
// 	cache.set<StackerSetCached>(cacheKey, result);
// 	return result;
// }

export async function getSmallPoxInfo(networkKey: string) {
  const poxInfo = await getPoxInfoInner(networkKey);
  return {
    firstBurnchainBlockHeight: poxInfo.first_burnchain_block_height,
    rewardCycleLength: poxInfo.reward_cycle_length,
    rewardCycleId: poxInfo.reward_cycle_id,
  };
}
export const getPoxInfo = memoizeCache(
  (networkKey: string) => `pox_info_${getApiUrl(networkKey)}`,
  getSmallPoxInfo,
);

// export async function getPoxInfo(networkKey: string) {
// 	const cacheKey = `pox_info_${networkKey}`;
// 	const cached = cache.get<PoxInfoCached>(cacheKey);
// 	if (cached) {
// 		return cached;
// 	}
// 	const result = await getPoxInfoInner(networkKey);
// 	cache.set<PoxInfoCached>(cacheKey, {
// 		reward_cycle_id: result.reward_cycle_id,
// 	});
// 	return result;
// }

export async function warmCache(networkKey: string) {
  const poxInfo = await getPoxInfo.warm(networkKey);
  const rewardCycle = poxInfo.rewardCycleId;
  await getStackerSetCache.warm(networkKey, rewardCycle);
  await stxCommittedCache.warm();
  await warmupMetrics();
}
