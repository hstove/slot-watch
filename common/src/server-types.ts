export type RecentSignersResponse = {
	networkKey: string;
	rewardCycle: number;
	signers: {
		publicKey: string;
		createdAt: string | null;
		data: string | null;
		weight: number;
		slotId: number;
	}[];
};
