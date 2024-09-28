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

export const MockProposalCoder = P.struct({
	typeId: P.U8,
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
	typeId: P.U8,
	proposal: MockProposalCoder,
	signatures: P.array(P.U32BE, P.bytes(65)),
	rest: P.bytes(null),
});

export const BlockProposalCoder = P.struct({
	typeId: P.U8,
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
	typeId: P.U8,
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

export const MinerSignatureHashCoder = P.struct({
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

export const BlockResponseAcceptedCoder = P.struct({
	typeId: P.U8,
	accepted: P.U8,
	hash: P.bytes(32),
	signature: P.bytes(65),
});

export const BlockResponseRejectedCoder = P.struct({
	typeId: P.U8,
	rejected: P.U8,
	reason: P.prefix(P.U32BE, P.string(null)),
	reason_code: P.U8,
	signer_signature_hash: P.bytes(32),
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
		return BlockProposalCoder.decode(chunk);
	}
	if (type === SignerMessageTypePrefix.BlockPushed) {
		return BlockPushedCoder.decode(chunk);
	}
	throw new Error(
		`Unknown type: ${type} (${Object.keys(SignerMessageTypePrefix)[type]})`,
	);
}

export function makeSignerSignatureHash(
	block: Omit<NakamotoBlock, "signer_signature_hash">,
) {
	const message = MinerSignatureHashCoder.encode(block);
	const hasher = new Bun.CryptoHasher("sha512-256");
	hasher.update(message);
	return new Uint8Array(hasher.digest());
}
