export type RecentSigner = {
	publicKey: string;
	createdAt: string | null;
	data: string | null;
	weight: number;
	slotId: number;
};

export type RecentSignersResponse = {
	networkKey: string;
	rewardCycle: number;
	signers: RecentSigner[];
};
