import { SignerSignatureHashCoder, type NakamotoBlock } from "./codec";

export function makeSignerSignatureHash(
	block: Omit<NakamotoBlock, "signer_signature_hash">,
) {
	const message = SignerSignatureHashCoder.encode(block);
	const hasher = new Bun.CryptoHasher("sha512-256");
	hasher.update(message);
	return new Uint8Array(hasher.digest());
}
