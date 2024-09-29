import { SignerSignatureHashCoder, type NakamotoBlock } from "./codec";
import { sha512_256 } from "@noble/hashes/sha2";

export async function makeSignerSignatureHash(
	block: Omit<NakamotoBlock, "signer_signature_hash">,
) {
	const message = SignerSignatureHashCoder.encode(block);
	return sha512_256(message);
	// const hashed = await crypto.subtle.digest("SHA-512", message);
	// hasher.update(message);
	// const
	// return new Uint8Array(hasher.digest());
	// return new Uint8Array(hashed.slice(0, 32));
}
