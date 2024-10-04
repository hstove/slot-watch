export type ChunkEvent = {
	contractId: string;
	slotId: number;
	version: number;
	data: string;
	signature: string;
	createdAt: string;
};

export const BlockResponseRejectCodes = [
	"Validation Failed",
	"The block was rejected due to connectivity issues with the signer.",
	"The block was proposed before and rejected by the signer.",
	"The block was rejected due to no sortition view.",
	"The block was rejected due to a mismatch with expected sortition view.",
	"The block was rejected due to a testing directive.",
] as const;

export const BlockResponseValidationCodes = [
	"Bad Block Hash",
	"Bad Transaction",
	"Invalid Block",
	"Chainstate Error",
	"Unknown Parent",
	"Non Canonical Tenure",
	"No Such Tenure",
] as const;
