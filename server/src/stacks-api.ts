import {
	getStackerSet as getStackerSetInner,
	getPoxInfo as getPoxInfoInner,
	type StackerSetSigner,
} from "slot-watch-common";
import type { CoreNodePoxResponse } from "@stacks/stacks-blockchain-api-types";
import NodeCache from "node-cache";

const cache = new NodeCache({ stdTTL: 60 * 1 });

export async function getStackerSet(networkKey: string, rewardCycle: number) {
	const cacheKey = `stacker_set_${networkKey}_${rewardCycle}`;
	const cached = cache.get<StackerSetSigner[]>(cacheKey);
	if (cached) {
		return cached;
	}
	const result = await getStackerSetInner(networkKey, rewardCycle);
	cache.set<StackerSetSigner[]>(cacheKey, result);
	return result;
}

export async function getPoxInfo(networkKey: string) {
	const cacheKey = `pox_info_${networkKey}`;
	const cached = cache.get<CoreNodePoxResponse>(cacheKey);
	if (cached) {
		return cached;
	}
	const result = await getPoxInfoInner(networkKey);
	cache.set<CoreNodePoxResponse>(cacheKey, result);
	return result;
}
