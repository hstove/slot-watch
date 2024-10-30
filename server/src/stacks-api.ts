import {
	getStackerSet as getStackerSetInner,
	getPoxInfo as getPoxInfoInner,
} from "slot-watch-common";
import { memoizeCache } from "./cache";

export const getStackerSet = memoizeCache(
	(networkKey: string, rewardCycle: number) =>
		`stacker_set_${networkKey}_${rewardCycle}`,
	getStackerSetInner,
);

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
		reward_cycle_id: poxInfo.reward_cycle_id,
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
	const poxInfo: { reward_cycle_id: number } =
		await getPoxInfo.warm(networkKey);
	const rewardCycle = poxInfo.reward_cycle_id;
	await getStackerSet.warm(networkKey, rewardCycle);
}
