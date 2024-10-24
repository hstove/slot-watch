export type RecentSigner = {
	publicKey: string;
	createdAt: string | null;
	data: string | null;
	weight: number;
	slotId: number;
	versionShort: string;
	version: string;
	weightPercent: number;
	weightPercentStr: string;
};

export type RecentSignersResponse = {
	networkKey: string;
	rewardCycle: number;
	totalWeight: number;
	signers: RecentSigner[];
};
