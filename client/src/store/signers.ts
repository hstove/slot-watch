import { atom } from "jotai";
import { networkIdAtom } from "./network";
import {
	getStackerSet,
	getCoreNodeInfo,
	getPoxInfo,
	type RecentSignersResponse,
	type RecentSigner,
} from "slot-watch-common";

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
