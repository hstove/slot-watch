import { hex } from "@scure/base";
import { decodeChunkMaybe, SignerMessageTypePrefix } from "./codec";

export type Prettify<T> = {
	[K in keyof T]: T[K];
} & {};

export function getVersionFromString(version: string) {
	// Handle `stacks-signer VERSION (...);`
	const match = version.match(/^stacks-signer ([^\s]*)/);
	if (match) {
		return match[1];
	}
	return "";
}

// Given a chunk in hex, return the version
export function versionFromData(data: string | null): string {
	if (!data) return "";
	const decoded = decodeChunkMaybe(hex.decode(data));
	if (!decoded) return "";
	if (decoded.typeId === SignerMessageTypePrefix.BlockResponse) {
		return decoded.metadata ?? "";
	}
	if (decoded.typeId === SignerMessageTypePrefix.MockSignature) {
		return decoded.metadata ?? "";
	}
	if (decoded.typeId === SignerMessageTypePrefix.MockSignatureOld) {
		return decoded.version ?? "";
	}
	return "";
}
