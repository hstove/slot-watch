import { atom } from "jotai";
import { networkIdAtom } from "./network";
import {
	getStackerSet,
	getCoreNodeInfo,
	getPoxInfo,
	type RecentSignersResponse,
	type RecentSigner,
} from "slot-watch-common";
import { differenceInSeconds } from "date-fns";

// export const stackerSetAtom = atom<StackerSetSigner[]>([]);

export const poxInfoAtom = atom(async (get) => {
	const networkId = get(networkIdAtom);
	return getPoxInfo(networkId);
});

export const rewardCycleAtom = atom(async (get) => {
	const poxInfo = await get(poxInfoAtom);
	return poxInfo.reward_cycle_id;
});

export const stackerSetAtom = atom(async (get) => {
	const rewardCycle = await get(rewardCycleAtom);
	const networkId = get(networkIdAtom);
	return getStackerSet(networkId, rewardCycle);
});

export async function getRecentSigners(networkId: string) {
	const res = await fetch(
		`https://slot-watch.fly.dev/signer-recency/${networkId}`,
	);
	const data = (await res.json()) as RecentSignersResponse;
	return data;
}

export type RecentSignerWithPower = RecentSigner & {
	power: number;
};

export const recentSignersAtom = atom(async (get) => {
	const networkId = get(networkIdAtom);
	const signers = await getRecentSigners(networkId);
	const total = signers.signers.reduce((acc, signer) => acc + signer.weight, 0);
	return {
		...signers,
		total,
		signers: signers.signers.map(
			(signer) =>
				({
					...signer,
					power: signer.weight / total,
				}) satisfies RecentSignerWithPower,
		),
	};
});

export const totalRecentSignersAtom = atom(async (get) => {
	const recentSigners = await get(recentSignersAtom);
	let total = 0;
	let numSigners = 0;
	for (const signer of recentSigners.signers) {
		if (!signer.createdAt) continue;
		const secondAgo = differenceInSeconds(new Date(), signer.createdAt);
		if (secondAgo > 60) continue;
		total += signer.weight;
		numSigners++;
	}
	const percent = (total / recentSigners.total) * 10000;
	const percentString = Math.round(percent) / 100;
	return {
		percentStr: percentString,
		percent,
		weight: total,
		total: recentSigners.total,
		numSigners,
	};
});
