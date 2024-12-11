import * as P from 'micro-packed';
import { sha512_256 } from '@noble/hashes/sha2';
import { secp256k1 } from '@noble/curves/secp256k1';
import {
  PayloadType,
  type TenureChangeCause,
  type StacksTransactionWire,
} from '@stacks/transactions';
import {
  deserializeTransaction,
  serializeTransaction,
} from '@stacks/transactions/dist/transaction';
import { BytesReader } from '@stacks/transactions/dist/BytesReader';
import type { Prettify } from '../utils';
import { hex } from '@scure/base';

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
      return acc + byte.toString(2).split('').reverse().join('');
    }, '')
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
      if (typeof value !== 'number')
        throw new Error(`TypeIdCoder: invalid value ${value}`);
      if (value !== id)
        throw new Error(`TypeIdCoder: invalid value ${value}, expected ${id}`);
      return value;
    },
  });
}

export const SignerMetadataCoder: P.CoderType<string | undefined> = P.wrap({
  encodeStream: (w: P.Writer, data: string | undefined) => {
    if (typeof data === 'string') {
      P.string(P.U32BE).encodeStream(w, data);
    }
  },
  decodeStream: (r: P.Reader) => {
    try {
      return P.string(P.U32BE).decodeStream(r);
    } catch (error) {
      return undefined;
    }
  },
});

export type BlockResponseData = {
  version: number;
  tenureExtendTimestamp: bigint | null;
  unknownBytes: Uint8Array;
};

export const BlockResponseDataCoder: P.CoderType<BlockResponseData> = P.wrap({
  encodeStream: (w: P.Writer, data: BlockResponseData) => {
    P.U8.encodeStream(w, data.version);
    const innerStruct = P.struct({
      tenureExtendTimestamp: P.U64BE,
      unknownBytes: P.bytes(null),
    }).encode({
      tenureExtendTimestamp: data.tenureExtendTimestamp ?? 0n,
      unknownBytes: data.unknownBytes,
    });
    P.U32BE.encodeStream(w, innerStruct.length);
    w.bytes(innerStruct);
  },
  decodeStream: (r: P.Reader) => {
    let version: number;
    try {
      version = P.U8.decodeStream(r);
    } catch (error) {
      return {
        version: 2,
        tenureExtendTimestamp: null,
        unknownBytes: new Uint8Array(),
      };
    }
    const innerBytes = P.bytes(P.U32BE).decodeStream(r);
    const tenureExtendTimestamp = P.U64BE.decode(innerBytes);
    const unknownBytes = innerBytes.slice(8);
    return { version, tenureExtendTimestamp, unknownBytes };
  },
});

const MockProposalInnerObj = {
  burnBlockHeight: P.U64BE,
  consensusHash: P.bytes(20),
  stacksTip: P.bytes(32),
  stacksHeight: P.U64BE,
  version: P.prefix(P.U8, P.string(null)),
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
  metadata: SignerMetadataCoder,
});

export const StacksTxCoder: P.CoderType<StacksTransactionWire> = P.wrap({
  encodeStream: (w: P.Writer, data: StacksTransactionWire) => {
    const bytes = serializeTransaction(data);
    w.bytes(hex.decode(bytes));
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
  // rest: P.bytes(null),
  // txs: P.array(P.U32BE, StacksTxCoder),
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
    if (typeof value !== 'boolean')
      throw new Error(`bool: invalid value ${value}`);
    return value;
  },
});

export const BlockResponseAcceptedCoder = P.struct({
  typeId: TypeIdCoder(SignerMessageTypePrefix.BlockResponse),
  accepted: InverseBoolCoder,
  signerSignatureHash: P.bytes(32),
  signature: P.bytes(65),
  metadata: SignerMetadataCoder,
  data: BlockResponseDataCoder,
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
    if (typeof data.validationCode === 'number') {
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
  data: BlockResponseDataCoder,
});

export const MockSignatureOldCoder = P.struct({
  typeId: TypeIdCoder(SignerMessageTypePrefix.MockSignatureOld),
  signature: P.bytes(65),
  burnBlockHeight: P.U64BE,
  consensusHash: P.bytes(20),
  stacksTip: P.bytes(32),
  stacksHeight: P.U64BE,
  version: P.prefix(P.U8, P.string(null)),
  poxConsensus: P.bytes(20),
  eventBurnHeight: P.U64BE,
  chainId: P.U32BE,
});

export type MockBlock = Prettify<
  Omit<P.UnwrapCoder<typeof MockBlockCoder>, 'proposal'> & {
    proposal: MockProposalInner;
  }
>;
export type MockProposal = Prettify<P.UnwrapCoder<typeof MockProposalCoder>>;
export type MockSignature = Prettify<
  Omit<P.UnwrapCoder<typeof MockSignatureCoder>, 'proposal'> & {
    proposal: MockProposalInner;
  }
>;
export type BlockProposal = Prettify<
  Omit<P.UnwrapCoder<typeof BlockProposalCoder>, 'rest'> & {
    blockHeight: bigint;
    rewardCycle: bigint;
    txCount: number;
    tenureChangeCause: TenureChangeCause | null;
  }
>;
export type BlockResponseAccepted = Prettify<
  {
    accepted: true;
  } & Omit<P.UnwrapCoder<typeof BlockResponseAcceptedCoder>, 'accepted'>
>;
export type BlockResponseRejected = Prettify<
  Omit<P.UnwrapCoder<typeof BlockResponseRejectedCoder>, 'accepted'> & {
    reasonCode: number;
    validationCode: number | undefined;
    accepted: false;
  }
>;

/**
 * Union type of raw block response messages
 */
export type BlockResponseMessage =
  | BlockResponseAccepted
  | BlockResponseRejected;

export type BlockPushed = Prettify<
  Omit<P.UnwrapCoder<typeof BlockPushedCoder>, 'rest'> & {
    txCount: number;
  }
>;

export type NakamotoBlock = Prettify<Omit<BlockPushed, 'rest' | 'typeId'>>;

export type MockSignatureOld = Prettify<
  P.UnwrapCoder<typeof MockSignatureOldCoder> & {
    isMockSignatureOld: true;
  }
>;

export type ChunkIdKeys = keyof typeof SignerMessageTypePrefix;

export function chunkTypeName(chunk: Uint8Array) {
  const type = chunk[0];
  switch (type) {
    case SignerMessageTypePrefix.BlockProposal:
      return 'Block Proposal';
    case SignerMessageTypePrefix.BlockResponse:
      return 'Block Response';
    case SignerMessageTypePrefix.BlockPushed:
      return 'Block Pushed';
    case SignerMessageTypePrefix.MockProposal: {
      try {
        MockSignatureOldCoder.decode(chunk);
        return 'Mock Signature (v0)';
      } catch (error) {
        return 'Mock Proposal';
      }
    }
    case SignerMessageTypePrefix.MockSignature:
      return 'Mock Signature';
    case SignerMessageTypePrefix.MockBlock:
      return 'Mock Block';
    default:
      return 'Unknown';
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
    const txs = remaining.slice(0, -16);
    const txCount = P.U32BE.decode(txs.slice(0, 4));
    const txReader = new BytesReader(txs.slice(4));
    let tenureChangeCause: TenureChangeCause | null = null;
    for (let i = 0; i < txCount; i++) {
      const tx = deserializeTransaction(txReader);
      if (tx.payload.payloadType === PayloadType.TenureChange) {
        tenureChangeCause = tx.payload.cause;
        break;
      }
    }
    return {
      ...proposal,
      blockHeight: extra.blockHeight,
      rewardCycle: extra.rewardCycle,
      txCount: txCount,
      tenureChangeCause,
    } satisfies BlockProposal;
  }
  if (type === SignerMessageTypePrefix.BlockPushed) {
    const { rest, ...pushed } = BlockPushedCoder.decode(chunk);
    const txCount = P.U32BE.decode(rest.slice(0, 4));
    // console.log(hex.encode(rest));
    return {
      ...pushed,
      txCount,
    } satisfies BlockPushed;
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
  block: Omit<NakamotoBlock, 'signer_signature_hash'>,
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

export function makeStacksBlockId(blockHash: string, consensusHash: string) {
  const blockHasher = sha512_256(hex.decode(blockHash + consensusHash));
  // const consensusHasher = sha512_256(blockHasher);
  return hex.encode(blockHasher);
}
