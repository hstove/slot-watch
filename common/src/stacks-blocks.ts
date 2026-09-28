import type { MinerIdentity } from './miner-names';
import type { NetworkKey } from './networks';
import type { ApiBlockProposal, ApiStacksBlock } from './server-types';
import type { TypeMerge } from './utils';
import type { O } from 'ts-toolbelt';

interface StacksBlockBase {
  blockTimestamp: string;
  blockHash: string;
  blockHeight: number;
  tenureChangeCause: number | null;
  txCount: number;
  burnBlockHeight: number;
  networkKey: NetworkKey;
  consensusHash: string;
  txFees: number;
}

interface _ProposalOnlyBlock extends StacksBlockBase, MinerIdentity {
  minerPublicKey: string | null;
  proposedAt: string;
  serverVersion: string | null;
  serverVersionShort: string | null;
}

interface _ProcessedStacksBlock extends StacksBlockBase {
  processedAt: string;
  burnBlockHash: string;
  readCount: number;
  readLength: number;
  runtime: number;
  writeCount: number;
  writeLength: number;
  indexBlockHash: string | null;
  burnBlockTimestamp: string;
}

export type ProposalOnlyBlock = TypeMerge<
  _ProposalOnlyBlock,
  _ProcessedStacksBlock
>;
export type ProcessedStacksBlock = TypeMerge<
  _ProcessedStacksBlock,
  _ProposalOnlyBlock
>;
export type AllInfoBlock = O.Merge<ProposalOnlyBlock, ProcessedStacksBlock>;

export type ApiBlockForBurnBlock =
  | ProposalOnlyBlock
  | ProcessedStacksBlock
  | AllInfoBlock;

export function mergeBlockData(
  proposal: ApiBlockProposal,
  stacksBlock: ApiStacksBlock | null
): ApiBlockForBurnBlock {
  const blockTimestamp = stacksBlock?.blockTimestamp ?? proposal.blockTimestamp;
  if (proposal && stacksBlock) {
    return {
      blockHash: proposal.signerSignatureHash,
      blockHeight: proposal.chainLength,
      minerPublicKey: proposal.minerPublicKey,
      minerLabel: proposal.minerLabel,
      minerColor: proposal.minerColor,
      minerAnimal: proposal.minerAnimal,
      txCount: proposal.txCount ?? 0,
      tenureChangeCause: proposal.tenureChangeCause,
      consensusHash: proposal.consensusHash,
      burnBlockHeight: stacksBlock.burnBlockHeight,
      networkKey: proposal.networkKey,
      proposedAt: proposal.createdAt,
      processedAt: stacksBlock.processedAt,
      burnBlockHash: stacksBlock.burnBlockHash,
      readCount: stacksBlock.readCount,
      readLength: stacksBlock.readLength,
      runtime: stacksBlock.runtime,
      writeCount: stacksBlock.writeCount,
      writeLength: stacksBlock.writeLength,
      blockTimestamp,
      indexBlockHash: stacksBlock.indexBlockHash,
      burnBlockTimestamp: stacksBlock.burnBlockTimestamp,
      serverVersion: proposal.serverVersion,
      serverVersionShort: proposal.serverVersionShort,
      txFees: stacksBlock.txFees,
    } satisfies AllInfoBlock;
  }
  return {
    blockHash: proposal.signerSignatureHash,
    blockHeight: proposal.chainLength,
    minerPublicKey: proposal.minerPublicKey,
    minerLabel: proposal.minerLabel,
    minerColor: proposal.minerColor,
    minerAnimal: proposal.minerAnimal,
    txCount: proposal.txCount ?? 0,
    tenureChangeCause: proposal.tenureChangeCause,
    consensusHash: proposal.consensusHash,
    burnBlockHeight: proposal.burnBlockHeight ?? 0,
    networkKey: proposal.networkKey,
    proposedAt: proposal.createdAt,
    blockTimestamp,
    serverVersion: proposal.serverVersion,
    serverVersionShort: proposal.serverVersionShort,
    txFees: proposal.txFees,
  } satisfies ProposalOnlyBlock;
}
