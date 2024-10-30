import { z } from "zod";

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

export type TimelineChunk = {
	slotId: number;
	version: number;
	contractId: string;
	signature: string;
	data: string;
	createdAt: string;
	publicKey: string | null;
	entity: string | null;
	others: Record<
		string,
		null | {
			createdAt: string;
			diffSeconds: number;
		}
	>;
};

export type TimelineResponse = {
	chunks: TimelineChunk[];
};

export const paginationSchema = z.object({
	offset: z.coerce.number().optional(),
});
