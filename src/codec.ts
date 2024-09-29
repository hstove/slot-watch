// import { webcrypto } from "web";
import * as P from "micro-packed";

export type BitVec = {
	length: number;
	bytes: Uint8Array;
};

function dataLen(_len: number) {
	const len = BigInt(_len);
	const extra = len % 8n === 0n ? 0n : 1n;
	return len / 8n + extra;
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
			if (value !== id) throw new Error(`TypeIdCoder: invalid value ${value}`);
			return value;
		},
	});
}

export const _TypeIdCoder = (
	id: SignerMessageTypeId,
): P.CoderType<SignerMessageTypeId> =>
	P.wrap({
		encodeStream: (w: P.Writer, value: SignerMessageTypeId) => w.byte(value),
		decodeStream: (r: P.Reader): SignerMessageTypeId => {
			const value = r.byte();
			return value as SignerMessageTypeId;
		},
		validate: (value: SignerMessageTypeId) => {
			if (typeof value !== "number")
				throw new Error(`TypeIdCoder: invalid value ${value}`);
			if (value !== id) throw new Error(`TypeIdCoder: invalid value ${value}`);
			return value;
		},
	});

export const MockProposalCoder = P.struct({
	typeId: TypeIdCoder(SignerMessageTypePrefix.MockProposal),
	burnBlockHeight: P.U64BE,
	consensusHash: P.bytes(20),
	stacksTip: P.bytes(32),
	stacksHeight: P.U64BE,
	server: P.prefix(P.U8, P.string(null)),
	poxConsensus: P.bytes(20),
	chainId: P.U32BE,
	signature: P.bytes(65),
});

export const MockBlockCoder = P.struct({
	typeId: TypeIdCoder(SignerMessageTypePrefix.MockBlock),
	proposal: MockProposalCoder,
	signatures: P.array(P.U32BE, P.bytes(65)),
	rest: P.bytes(null),
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

export const BlockResponseAcceptedCoder = P.struct({
	typeId: TypeIdCoder(SignerMessageTypePrefix.BlockResponse),
	accepted: InverseBoolCoder,
	signerSignatureHash: P.bytes(32),
	signature: P.bytes(65),
});

export const BlockResponseRejectedCoder = P.struct({
	typeId: TypeIdCoder(SignerMessageTypePrefix.BlockResponse),
	accepted: InverseBoolCoder,
	reason: P.prefix(P.U32BE, P.string(null)),
	reason_code: P.U8,
	signerSignatureHash: P.bytes(32),
	chain_id: P.U32BE,
	signature: P.bytes(65),
});

export type MockBlock = P.UnwrapCoder<typeof MockBlockCoder>;
export type MockProposal = P.UnwrapCoder<typeof MockProposalCoder>;
export type BlockProposal = P.UnwrapCoder<typeof BlockProposalCoder>;
export type BlockResponseAccepted = P.UnwrapCoder<
	typeof BlockResponseAcceptedCoder
>;
export type BlockResponseRejected = P.UnwrapCoder<
	typeof BlockResponseRejectedCoder
>;
export type BlockPushed = P.UnwrapCoder<typeof BlockPushedCoder>;

export type NakamotoBlock = Omit<BlockPushed, "rest">;

export function chunkTypeName(chunk: Uint8Array) {
	const type = chunk[0];
	return Object.keys(SignerMessageTypePrefix)[type];
}

export type DecodedChunk = ReturnType<typeof decodeChunk>;

export function decodeChunk(chunk: Uint8Array) {
	const type = chunk[0];
	// console.log(Object.keys(SignerMessageTypePrefix));
	// console.log("Type: ", type);
	// console.log(Object.keys(SignerMessageTypePrefix)[type]);
	if (type === SignerMessageTypePrefix.MockBlock) {
		return MockBlockCoder.decode(chunk);
	}
	if (type === SignerMessageTypePrefix.MockProposal) {
		return MockProposalCoder.decode(chunk);
	}
	if (type === SignerMessageTypePrefix.BlockResponse) {
		const accepted = chunk[1];
		if (accepted === 0) {
			return BlockResponseAcceptedCoder.decode(chunk);
		}
		return BlockResponseRejectedCoder.decode(chunk);
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
		};
	}
	if (type === SignerMessageTypePrefix.BlockPushed) {
		return BlockPushedCoder.decode(chunk);
	}
	throw new Error(
		`Unknown type: ${type} (${Object.keys(SignerMessageTypePrefix)[type]})`,
	);
}
