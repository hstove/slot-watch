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

export type ModifiedSlot = {
	slot_id: number;
	slot_version: number;
	data: string;
	sig: string;
};

export type StackerDBPayload = {
	contract_id: {
		issuer: [number, Uint8Array];
		name: string;
	};
	modified_slots: ModifiedSlot[];
};
