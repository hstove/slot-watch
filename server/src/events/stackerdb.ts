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
	recoverChunkPublicKey,
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
		const publicKey = recoverChunkPublicKey({
			data: hex.decode(chunk.data),
			slotId: chunk.slot_id,
			version: chunk.slot_version,
			signature: hex.decode(chunk.sig),
		}).toHex();
		await db.insert(stackerDbSlots).values({
			slotId: chunk.slot_id,
			version: chunk.slot_version,
			contractId,
			networkKey,
			signature: hex.decode(chunk.sig),
			data: hex.decode(chunk.data),
			createdAt: receivedAt,
			publicKey,
		});
		const decoded = decodeChunkMaybe(hex.decode(chunk.data));
		if (decoded === null) {
			console.error(`Error decoding chunk: ${chunk.data}`, chunk);
			continue;
		}
		if (decoded.typeId === SignerMessageTypePrefix.BlockProposal) {
			await handleBlockProposal({
				payload: decoded,
				receivedAt,
				networkKey,
				publicKey,
			});
		} else if (decoded.typeId === SignerMessageTypePrefix.BlockPushed) {
			await handleBlockPush({
				payload: decoded,
				receivedAt,
				networkKey,
				publicKey,
			});
		} else if (decoded.typeId === SignerMessageTypePrefix.BlockResponse) {
			await handleBlockResponse({
				chunk,
				payload: decoded,
				receivedAt,
				networkKey,
				publicKey,
			});
		}
	}
}

export async function handleBlockProposal({
	payload,
	receivedAt,
	networkKey,
	publicKey,
}: {
	payload: BlockProposal;
	receivedAt: Date;
	networkKey: string;
	publicKey: string;
}) {
	const signerSignatureHash = makeSignerSignatureHash(payload);
	await db.insert(blockProposals).values({
		signerSignatureHash: hex.encode(signerSignatureHash),
		chainLength: Number(payload.chainLength),
		createdAt: receivedAt,
		networkKey,
		minerPublicKey: publicKey,
	});
}

export async function handleBlockPush({
	payload,
	receivedAt,
	networkKey,
	publicKey,
}: {
	payload: BlockPushed;
	receivedAt: Date;
	networkKey: string;
	publicKey: string;
}) {
	const signerSignatureHash = makeSignerSignatureHash(payload);
	await db.insert(blockPushes).values({
		signerSignatureHash: hex.encode(signerSignatureHash),
		chainLength: Number(payload.chainLength),
		createdAt: receivedAt,
		networkKey,
		minerPublicKey: publicKey,
	});
}

export async function handleBlockResponse({
	chunk,
	payload,
	receivedAt,
	networkKey,
	publicKey,
}: {
	chunk: ModifiedSlot;
	payload: BlockResponseAccepted | BlockResponseRejected;
	receivedAt: Date;
	networkKey: string;
	publicKey: string;
}) {
	await db.insert(blockResponses).values({
		signerSignatureHash: hex.encode(payload.signerSignatureHash),
		slotId: chunk.slot_id,
		createdAt: receivedAt,
		networkKey,
		signerPublicKey: publicKey,
		accepted: payload.accepted,
	});
}
