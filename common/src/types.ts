import type {
	CoreNodeBlockMessage,
	CoreNodeBurnBlockMessage,
} from "./event-stream-types";

export const CHUNKS_EVENT = "chunks";
export const BURN_BLOCKS_EVENT = "burn_blocks";
export const NEW_BLOCK_EVENT = "new_block";

export type { ModifiedSlot, StackerDBPayload } from "./event-stream-types";

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

export type WSBase<Type extends string> = {
	networkKey: string;
	type: Type;
	receivedAt: string;
};

export type WSChunkEvent = WSBase<typeof CHUNKS_EVENT> & {
	payload: ChunkEvent;
};

export type WSNewBlock = WSBase<typeof NEW_BLOCK_EVENT> & {
	payload: CoreNodeBlockMessage;
};

export type WSBurnBlock = WSBase<typeof BURN_BLOCKS_EVENT> & {
	payload: CoreNodeBurnBlockMessage;
};

export type WSPayload = WSChunkEvent | ChunkEvent | WSNewBlock | WSBurnBlock;

export function getPayloadId(payload: WSPayload): string {
	if (!("type" in payload)) {
		return `${payload.slotId}-${payload.version}-${payload.contractId}`;
	}
	if (payload.type === CHUNKS_EVENT) {
		const chunk = payload.payload;
		return `${payload.type}-${chunk.slotId}-${chunk.version}-${chunk.contractId}`;
	}
	return `${payload.type}-${payload.receivedAt}`;
}
