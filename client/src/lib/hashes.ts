import { SignerSignatureHashCoder, type NakamotoBlock } from "./codec";
import { sha512_256 } from "@noble/hashes/sha2";

// async function sha512_256(message: Uint8Array) {
// 	// Convert the message to an ArrayBuffer if it's not already

// 	// Compute the SHA-512 hash
// 	const hashBuffer = await crypto.subtle.digest("SHA-512", message);

// 	// Convert the hash to a Uint8Array
// 	const hashArray = new Uint8Array(hashBuffer);

// 	// Truncate to 256 bits (32 bytes)
// 	const truncatedHash = hashArray.slice(0, 32);

// 	return truncatedHash;

// 	// // Convert to hex string
// 	// return Array.from(truncatedHash)
// 	//   .map(b => b.toString(16).padStart(2, '0'))
// 	//   .join('');
// }

export async function makeSignerSignatureHash(
	block: Omit<NakamotoBlock, "signer_signature_hash">,
) {
	const message = SignerSignatureHashCoder.encode(block);
	return sha512_256(message);
	// const hasher = new Bun.CryptoHasher("sha512-256");
	// const hasher = webcrypto.subtle.digest("SHA-256", message);
	// const hash1 = await crypto.subtle.digest("SHA-512", message);
	// // truncate to match the 512-256 output
	// const truncatedHash = hash1.slice(0, 32);
	// return new Uint8Array(truncatedHash);
	// const hashed = await crypto.subtle.digest("SHA-512", hash1);
	// hasher.update(message);
	// return new Uint8Array(hashed);
	// return sha512_256(message);
}
