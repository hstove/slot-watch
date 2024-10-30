import {
	AddressVersion,
	addressFromVersionHash,
	addressToString,
} from "@stacks/transactions";
import { hex } from "@scure/base";
import {
	chunkTypeName,
	knownSigners,
	recoverChunkPublicKey,
	type ChunkEventParsed,
	type StackerDBPayload,
} from "slot-watch-common";

export function getPayloadContractId(payload: StackerDBPayload) {
	const version =
		payload.contract_id.issuer[0] === 26
			? AddressVersion.TestnetSingleSig
			: AddressVersion.MainnetSingleSig;
	const address = addressFromVersionHash(
		version,
		hex.encode(new Uint8Array(payload.contract_id.issuer[1])),
	);
	return `${addressToString(address)}.${payload.contract_id.name}`;
}

type DbChunk = {
	id: number;
	slotId: number;
	version: number;
	signature: Uint8Array;
	data: Uint8Array;
	contractId: string;
	createdAt: Date;
	networkKey: string | null;
	publicKey: string | null;
};

export function serializeDbChunk(chunk: DbChunk): ChunkEventParsed {
	const publicKey = chunk.publicKey ?? recoverChunkPublicKey(chunk).toHex();
	const entity = knownSigners[publicKey] ?? null;
	return {
		...chunk,
		signature: hex.encode(chunk.signature),
		data: hex.encode(chunk.data),
		createdAt: chunk.createdAt.toISOString(),
		type: chunkTypeName(chunk.data),
		publicKey,
		entity,
	};
}
