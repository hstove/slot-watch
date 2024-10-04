import {
	makeSignerSignatureHash,
	type BlockProposal,
	type BlockPushed,
	type BlockResponseAccepted,
	type BlockResponseRejected,
	type DecodedChunk,
	type ModifiedSlot,
	decodeChunk,
	type StackerDBPayload,
	SignerMessageTypePrefix,
	decodeChunkMaybe,
} from "slot-watch-common";
import { db } from "../db";
import { getPayloadContractId } from "../utils";
import {
	blockProposals,
	blockPushes,
	blockResponses,
	stackerDbSlots,
} from "../schema";
import { hex } from "@scure/base";

export async function handleStackerDBChunk(
	payload: StackerDBPayload,
	receivedAt: Date,
	networkKey: string,
) {
	const contractId = getPayloadContractId(payload);

	for (const chunk of payload.modified_slots) {
		const sharedPayload = {
			slotId: chunk.slot_id,
			version: chunk.slot_version,
			contractId,
			networkKey,
		};
		await db.insert(stackerDbSlots).values({
			...sharedPayload,
			signature: hex.decode(chunk.sig),
			data: hex.decode(chunk.data),
			createdAt: receivedAt,
		});
		const decoded = decodeChunkMaybe(hex.decode(chunk.data));
		if (decoded === null) {
			console.error(`Error decoding chunk: ${chunk.data}`);
			continue;
		}
		if (decoded.typeId === SignerMessageTypePrefix.BlockProposal) {
			await handleBlockProposal(decoded, receivedAt, networkKey);
		} else if (decoded.typeId === SignerMessageTypePrefix.BlockPushed) {
			await handleBlockPush(decoded, receivedAt, networkKey);
		} else if (decoded.typeId === SignerMessageTypePrefix.BlockResponse) {
			await handleBlockResponse(chunk, decoded, receivedAt, networkKey);
		}
	}
}

export async function handleBlockProposal(
	payload: BlockProposal,
	receivedAt: Date,
	networkKey: string,
) {
	const signerSignatureHash = makeSignerSignatureHash(payload);
	await db.insert(blockProposals).values({
		signerSignatureHash: hex.encode(signerSignatureHash),
		chainLength: Number(payload.chainLength),
		createdAt: receivedAt,
		networkKey,
	});
}

export async function handleBlockPush(
	payload: BlockPushed,
	receivedAt: Date,
	networkKey: string,
) {
	const signerSignatureHash = makeSignerSignatureHash(payload);
	await db.insert(blockPushes).values({
		signerSignatureHash: hex.encode(signerSignatureHash),
		chainLength: Number(payload.chainLength),
		createdAt: receivedAt,
		networkKey,
	});
}

export async function handleBlockResponse(
	chunk: ModifiedSlot,
	payload: BlockResponseAccepted | BlockResponseRejected,
	receivedAt: Date,
	networkKey: string,
) {
	await db.insert(blockResponses).values({
		signerSignatureHash: hex.encode(payload.signerSignatureHash),
		slotId: chunk.slot_id,
		createdAt: receivedAt,
		networkKey,
	});
}
