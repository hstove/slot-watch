import * as P from "micro-packed";
import { sha512_256 } from "@noble/hashes/sha2";
import type { ChunkEvent } from "./types";
import { secp256k1 } from "@noble/curves/secp256k1";
import type { StacksTransaction } from "@stacks/transactions";
import {
	deserializeTransaction,
	serializeTransaction,
} from "@stacks/transactions/dist/transaction";

export type BitVec = {
	length: number;
	bytes: Uint8Array;
};

function dataLen(_len: number) {
	const len = BigInt(_len);
	const extra = len % 8n === 0n ? 0n : 1n;
	return len / 8n + extra;
}

// Rust code:

// /// Serialize a BitVec to a string of 1s and 0s for display
//     /// purposes. For example, a BitVec with [true, false, true]
//     /// will be serialized to "101".
//     pub fn binary_str(&self) -> String {
// 			self.clone()
// 					.data
// 					.into_iter()
// 					.fold(String::new(), |acc, byte| {
// 							acc + &format!("{:08b}", byte).chars().rev().collect::<String>()
// 					})
// 					.chars()
// 					.take(self.len() as usize)
// 					.collect::<String>()
// 	}

export function binaryString(bitvec: BitVec) {
	return bitvec.bytes
		.reduce((acc, byte) => {
			return acc + byte.toString(2).split("").reverse().join("");
		}, "")
		.slice(0, bitvec.length);
}

export const BitVecCoder = P.wrap({
	encodeStream: (w: P.Writer, data: BitVec) => {
		// const len = data.length;
		P.U16BE.encodeStream(w, data.length);
		P.U32BE.encodeStream(w, data.bytes.length);
		w.bytes(data.bytes);
	},
	decodeStream: (r: P.Reader) => {
		const len = P.U16BE.decodeStream(r);
		// console.log("len", len);
		const bytesLen = dataLen(len);
		// console.log("bytesLen", bytesLen);
		const bytes = P.bytes(P.U32BE).decodeStream(r);
		return {
			length: len,
			bytes,
		};
	},
});

export const SignerMessageTypePrefix = {
	/// Block Proposal message from miners
	BlockProposal: 0,
	/// Block Response message from signers
	BlockResponse: 1,
	/// Block Pushed message from miners
	BlockPushed: 2,
	/// Mock block proposal message from Epoch 2.5 miners
	MockProposal: 3,
	/// Mock block signature message from Epoch 2.5 signers
	MockSignature: 4,
	/// Mock block message from Epoch 2.5 miners
	MockBlock: 5,
	/// Earlier mock signature message
	MockSignatureOld: 3,
} as const;

export type SignerMessageTypeId =
	(typeof SignerMessageTypePrefix)[keyof typeof SignerMessageTypePrefix];

export function TypeIdCoder<T extends SignerMessageTypeId>(
	id: T,
): P.CoderType<T> {
	return P.wrap({
		encodeStream: (w: P.Writer, value: T) => w.byte(value),
		decodeStream: (r: P.Reader): T => {
			const value = r.byte();
			return value as T;
		},
		validate: (value: T) => {
			if (typeof value !== "number")
				throw new Error(`TypeIdCoder: invalid value ${value}`);
			if (value !== id)
				throw new Error(`TypeIdCoder: invalid value ${value}, expected ${id}`);
			return value;
		},
	});
}

const MockProposalInnerObj = {
	burnBlockHeight: P.U64BE,
	consensusHash: P.bytes(20),
	stacksTip: P.bytes(32),
	stacksHeight: P.U64BE,
	server: P.prefix(P.U8, P.string(null)),
	poxConsensus: P.bytes(20),
	chainId: P.U32BE,
	signature: P.bytes(65),
};

const MockProposalInnerCoder = P.struct(MockProposalInnerObj);

export type MockProposalInner = P.UnwrapCoder<typeof MockProposalInnerCoder>;

export const MockProposalCoder = P.struct({
	typeId: TypeIdCoder(SignerMessageTypePrefix.MockProposal),
	...MockProposalInnerObj,
});

export const MockBlockCoder = P.struct({
	typeId: TypeIdCoder(SignerMessageTypePrefix.MockBlock),
	proposal: P.struct(MockProposalInnerObj),
	signatures: P.array(P.U32BE, P.bytes(65)),
	rest: P.bytes(null),
});

export const MockSignatureCoder = P.struct({
	typeId: TypeIdCoder(SignerMessageTypePrefix.MockSignature),
	signature: P.bytes(65),
	proposal: P.struct(MockProposalInnerObj),
});

export const StacksTxCoder: P.CoderType<StacksTransaction> = P.wrap({
	encodeStream: (w: P.Writer, data: StacksTransaction) => {
		const bytes = serializeTransaction(data);
		w.bytes(bytes);
	},
	decodeStream: (r: P.Reader) => {
		const bytes = P.bytes(null).decodeStream(r);
		return deserializeTransaction(bytes);
	},
});

export const BlockProposalCoder = P.struct({
	typeId: TypeIdCoder(SignerMessageTypePrefix.BlockProposal),
	blockVersion: P.U8,
	chainLength: P.U64BE,
	burnSpent: P.U64BE,
	consensusHash: P.bytes(20),
	parentBlockId: P.bytes(32),
	txMerkleRoot: P.bytes(32),
	stateRoot: P.bytes(32),
	timestamp: P.U64BE,
	minerSignature: P.bytes(65),
	signerSignature: P.array(P.U32BE, P.bytes(65)),
	bitvec: BitVecCoder,
	// txs
	// burn height
	// reward cycle
	rest: P.bytes(null),
});

export const BlockPushedCoder = P.struct({
	typeId: TypeIdCoder(SignerMessageTypePrefix.BlockPushed),
	blockVersion: P.U8,
	chainLength: P.U64BE,
	burnSpent: P.U64BE,
	consensusHash: P.bytes(20),
	parentBlockId: P.bytes(32),
	txMerkleRoot: P.bytes(32),
	stateRoot: P.bytes(32),
	timestamp: P.U64BE,
	minerSignature: P.bytes(65),
	signerSignature: P.array(P.U32BE, P.bytes(65)),
	bitvec: BitVecCoder,
	// txs
	rest: P.bytes(null),
	// txs: P.array(P.U32BE, StacksTxCoder),
});

export const SignerSignatureHashCoder = P.struct({
	blockVersion: P.U8,
	chainLength: P.U64BE,
	burnSpent: P.U64BE,
	consensusHash: P.bytes(20),
	parentBlockId: P.bytes(32),
	txMerkleRoot: P.bytes(32),
	stateRoot: P.bytes(32),
	timestamp: P.U64BE,
	minerSignature: P.bytes(65),
	bitvec: BitVecCoder,
});

export const InverseBoolCoder: P.CoderType<boolean> = /* @__PURE__ */ P.wrap({
	size: 1,
	encodeStream: (w: P.Writer, value: boolean) => w.byte(value ? 0 : 1),
	decodeStream: (r: P.Reader): boolean => {
		const value = r.byte();
		if (value !== 0 && value !== 1) throw r.err(`bool: invalid value ${value}`);
		return value === 0;
	},
	validate: (value) => {
		if (typeof value !== "boolean")
			throw new Error(`bool: invalid value ${value}`);
		return value;
	},
});

export const SignerMetadataCoder: P.CoderType<string | null> = P.wrap({
	encodeStream: (w: P.Writer, data: string | null) => {
		if (data === null) {
			// w.byte(0);
		} else {
			// P.U8.encodeStream(w, data.length);
			// const bytes = P.string(data.length).encodeStream(w, data);
			P.string(P.U32BE).encodeStream(w, data);
		}
	},
	decodeStream: (r: P.Reader) => {
		try {
			// const length = P.U32BE.decodeStream(r);
			// return P.prefix(P.U8, P.string(null)).decodeStream(r);
			return P.string(P.U32BE).decodeStream(r);
		} catch (error) {
			return null;
		}
	},
});

export const BlockResponseAcceptedCoder = P.struct({
	typeId: TypeIdCoder(SignerMessageTypePrefix.BlockResponse),
	accepted: InverseBoolCoder,
	signerSignatureHash: P.bytes(32),
	signature: P.bytes(65),
	metadata: SignerMetadataCoder,
});

export const ValidationErrorCoder: P.CoderType<{
	reasonCode: number;
	validationCode: number | undefined;
}> = P.wrap({
	encodeStream: (
		w: P.Writer,
		data: { reasonCode: number; validationCode: number | undefined },
	) => {
		P.U8.encodeStream(w, data.reasonCode);
		if (typeof data.validationCode === "number") {
			P.U8.encodeStream(w, data.validationCode);
		}
	},
	decodeStream: (r: P.Reader) => {
		const reasonCode = P.U8.decodeStream(r);
		const validationCode = reasonCode === 0 ? P.U8.decodeStream(r) : undefined;
		return {
			reasonCode,
			validationCode,
		};
	},
});

export const BlockResponseRejectedCoder = P.struct({
	typeId: TypeIdCoder(SignerMessageTypePrefix.BlockResponse),
	accepted: InverseBoolCoder,
	reason: P.prefix(P.U32BE, P.string(null)),
	reasonCode: ValidationErrorCoder,
	signerSignatureHash: P.bytes(32),
	chainId: P.U32BE,
	signature: P.bytes(65),
	metadata: SignerMetadataCoder,
});

export const MockSignatureOldCoder = P.struct({
	typeId: TypeIdCoder(SignerMessageTypePrefix.MockSignatureOld),
	signature: P.bytes(65),
	burnBlockHeight: P.U64BE,
	consensusHash: P.bytes(20),
	stacksTip: P.bytes(32),
	stacksHeight: P.U64BE,
	server: P.prefix(P.U8, P.string(null)),
	poxConsensus: P.bytes(20),
	eventBurnHeight: P.U64BE,
	chainId: P.U32BE,
});

export type MockBlock = Omit<
	P.UnwrapCoder<typeof MockBlockCoder>,
	"proposal"
> & {
	proposal: MockProposalInner;
};
export type MockProposal = P.UnwrapCoder<typeof MockProposalCoder>;
export type MockSignature = Omit<
	P.UnwrapCoder<typeof MockSignatureCoder>,
	"proposal"
> & {
	proposal: MockProposalInner;
};
export type BlockProposal = Omit<
	P.UnwrapCoder<typeof BlockProposalCoder>,
	"rest"
> & {
	blockHeight: bigint;
	rewardCycle: bigint;
};
export type BlockResponseAccepted = Omit<
	P.UnwrapCoder<typeof BlockResponseAcceptedCoder>,
	"accepted"
> & { accepted: true };
export type BlockResponseRejected = Omit<
	P.UnwrapCoder<typeof BlockResponseRejectedCoder>,
	"accepted"
> & { reasonCode: number; validationCode: number | undefined; accepted: false };
export type BlockPushed = P.UnwrapCoder<typeof BlockPushedCoder>;

export type NakamotoBlock = Omit<BlockPushed, "rest" | "typeId">;

export type MockSignatureOld = P.UnwrapCoder<typeof MockSignatureOldCoder> & {
	isMockSignatureOld: true;
};

export type ChunkIdKeys = keyof typeof SignerMessageTypePrefix;

export function chunkTypeName(chunk: Uint8Array) {
	const type = chunk[0];
	const key = Object.keys(SignerMessageTypePrefix)[type] as ChunkIdKeys;
	switch (key) {
		case "BlockProposal":
			return "Block Proposal";
		case "BlockResponse": {
			const accepted = chunk[1] === 0;
			return accepted ? "Block Accepted" : "Block Rejected";
		}
		case "BlockPushed":
			return "Block Pushed";
		case "MockProposal":
			return "Mock Proposal";
		case "MockSignature":
			return "Mock Signature";
		case "MockBlock":
			return "Mock Block";
		default:
			return "Unknown";
	}
}

export type ChunkType = ReturnType<typeof chunkTypeName>;

export type DecodedChunk = ReturnType<typeof decodeChunk>;

export function decodeChunk(chunk: Uint8Array) {
	const type = chunk[0];
	if (type === SignerMessageTypePrefix.MockBlock) {
		return MockBlockCoder.decode(chunk) as MockBlock;
	}
	if (type === SignerMessageTypePrefix.MockProposal) {
		try {
			return MockProposalCoder.decode(chunk) as MockProposal;
		} catch (error) {
			const decoded = MockSignatureOldCoder.decode(chunk);
			return {
				...decoded,
				isMockSignatureOld: true,
			} satisfies MockSignatureOld;
		}
	}
	if (type === SignerMessageTypePrefix.BlockResponse) {
		const accepted = chunk[1];
		if (accepted === 0) {
			return BlockResponseAcceptedCoder.decode(chunk) as BlockResponseAccepted;
		}
		const { reasonCode, ...rejection } =
			BlockResponseRejectedCoder.decode(chunk);
		return {
			...rejection,
			...reasonCode,
		} as BlockResponseRejected;
	}
	if (type === SignerMessageTypePrefix.BlockProposal) {
		const { rest: remaining, ...proposal } = BlockProposalCoder.decode(chunk);
		const withoutTxs = remaining.slice(-16);
		const extra = P.struct({
			blockHeight: P.U64BE,
			rewardCycle: P.U64BE,
		}).decode(withoutTxs);
		return {
			...proposal,
			blockHeight: extra.blockHeight,
			rewardCycle: extra.rewardCycle,
		} satisfies BlockProposal;
	}
	if (type === SignerMessageTypePrefix.BlockPushed) {
		return BlockPushedCoder.decode(chunk);
	}
	if (type === SignerMessageTypePrefix.MockSignature) {
		return MockSignatureCoder.decode(chunk) as MockSignature;
	}
	throw new Error(
		`Unknown type: ${type} (${Object.keys(SignerMessageTypePrefix)[type]})`,
	);
}

export function decodeChunkMaybe(chunk: Uint8Array): DecodedChunk | null {
	try {
		return decodeChunk(chunk);
	} catch (error) {
		return null;
	}
}

export function makeSignerSignatureHash(
	block: Omit<NakamotoBlock, "signer_signature_hash">,
) {
	const message = SignerSignatureHashCoder.encode(block);
	return sha512_256(message);
}

export const ChunkAuthDigestCoder = P.struct({
	slotId: P.U32BE,
	version: P.U32BE,
	dataHash: P.bytes(32),
});

type MinimalChunkData = {
	slotId: number;
	version: number;
	data: Uint8Array;
};

export function chunkAuthDigest(chunk: MinimalChunkData) {
	const dataHash = sha512_256(chunk.data);
	const message = ChunkAuthDigestCoder.encode({
		slotId: chunk.slotId,
		version: chunk.version,
		dataHash: dataHash,
	});
	return sha512_256(message);
}

export function vrsToRsv(sig: Uint8Array) {
	return new Uint8Array([...sig.slice(1), ...sig.slice(0, 1)]).slice(0, 64);
}

export function rsvToVrs(sig: Uint8Array) {
	return new Uint8Array([...sig.slice(1, 64), sig[0]]);
}

// Sig is in VRS
export function compactToSig(sig: Uint8Array) {
	const base = vrsToRsv(sig);
	const recovery = sig[0];
	const signature = secp256k1.Signature.fromCompact(base);
	return signature.addRecoveryBit(recovery);
}

export function recoverChunkPublicKey(
	chunk: MinimalChunkData & { signature: Uint8Array },
) {
	const message = chunkAuthDigest(chunk);
	const sig = compactToSig(chunk.signature);
	return sig.recoverPublicKey(message);
}
