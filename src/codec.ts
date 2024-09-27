import * as P from "micro-packed";

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
	// signaturesSize: P.U32BE,
	// signatures: P.array( 'signaturesSize', P.bytes(65)),
	// signatures: P.array(
	//   'signaturesSize',
	//   P.struct({
	//     signature: P.bytes(65),
	//     proposal: MockProposal,
	//   })
	// ),
	rest: P.bytes(null),
});

export const BlockResponseAcceptedCoder = P.struct({
	typeId: P.U8,
	accepted: P.U8,
	hash: P.bytes(32),
	signature: P.bytes(65),
	// rest: P.bytes(null),
});

export const BlockResponseRejectedCoder = P.struct({
	typeId: P.U8,
	rejected: P.U8,
	reason: P.prefix(P.U32BE, P.string(null)),
	reason_code: P.U8,
	signer_signature_hash: P.bytes(32),
	chain_id: P.U32BE,
	signature: P.bytes(65),
	// rest: P.bytes(null),
});

type MockBlock = P.UnwrapCoder<typeof MockBlockCoder>;
type MockProposal = P.UnwrapCoder<typeof MockProposalCoder>;

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
	throw new Error(
		`Unknown type: ${type} (${Object.keys(SignerMessageTypePrefix)[type]})`,
	);
}
