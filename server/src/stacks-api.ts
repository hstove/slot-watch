import {
	getStackerSet as getStackerSetInner,
	getPoxInfo as getPoxInfoInner,
	type StackerSetSigner,
} from "slot-watch-common";
import type { CoreNodePoxResponse } from "@stacks/stacks-blockchain-api-types";
import NodeCache from "node-cache";

const cache = new NodeCache({ stdTTL: 60 * 10 });

type PoxInfoCached = Pick<CoreNodePoxResponse, "reward_cycle_id">;
type StackerSetCached = StackerSetSigner[];

export async function getStackerSet(networkKey: string, rewardCycle: number) {
	const cacheKey = `stacker_set_${networkKey}_${rewardCycle}`;
	const cached = cache.get<StackerSetCached>(cacheKey);
	if (cached) {
		return cached;
	}
	const result = await getStackerSetInner(networkKey, rewardCycle);
	cache.set<StackerSetCached>(cacheKey, result);
	return result;
}

export async function getPoxInfo(networkKey: string) {
	const cacheKey = `pox_info_${networkKey}`;
	const cached = cache.get<PoxInfoCached>(cacheKey);
	if (cached) {
		return cached;
	}
	const result = await getPoxInfoInner(networkKey);
	cache.set<PoxInfoCached>(cacheKey, {
		reward_cycle_id: result.reward_cycle_id,
	});
	return result;
}

export async function warmCache(networkKey: string) {
	const poxInfo = await getPoxInfo(networkKey);
	const rewardCycle = poxInfo.reward_cycle_id;
	const stackerSet = await getStackerSet(networkKey, rewardCycle);
	cache.set<PoxInfoCached>(`pox_info_${networkKey}`, {
		reward_cycle_id: poxInfo.reward_cycle_id,
	});
	cache.set<StackerSetCached>(
		`stacker_set_${networkKey}_${rewardCycle}`,
		stackerSet,
	);
}
