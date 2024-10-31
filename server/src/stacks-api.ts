import {
	getStackerSet as getStackerSetInner,
	getPoxInfo as getPoxInfoInner,
	type StackerSetSigner,
} from "slot-watch-common";
import { memoizeCache } from "./cache";

export const getStackerSetCache = memoizeCache(
	(networkKey: string, rewardCycle: number) =>
		`stacker_set_${networkKey}_${rewardCycle}`,
	getStackerSetInner,
);

export async function getStackerSet(networkKey: string, rewardCycle: number) {
	const signers = await getStackerSetCache.get(networkKey, rewardCycle);
	const signersByKey = new Map<string, StackerSetSigner>();
	for (const signer of signers) {
		signersByKey.set(signer.signing_key, signer);
	}
	const totalWeight = signers.reduce((acc, signer) => acc + signer.weight, 0);

	return {
		signers,
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
	(networkKey: string) => `pox_info_${networkKey}`,
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
}
