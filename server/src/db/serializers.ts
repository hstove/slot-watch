import type {
  BlockPreCommitDb,
  BlockProposalDb,
  BlockResponseDb,
  BurnBlockDb,
  StacksBlockDb,
  StateMachineUpdateDb,
} from './schema';
import {
  type ApiBlockPreCommit,
  type ApiBlockProposal,
  type ApiBurnBlock,
  type ApiStacksBlock,
  type ApiStateMachineMinerState,
  type ApiStateMachineUpdate,
  type BlockResponseApi,
  type StateMachineUpdateMinerState,
  getMinerIdentity,
  getVersionFromString,
  superDeserialize,
  type NetworkKey,
} from 'slot-watch-common';
import { getCreatedAt } from '../utils';
import { hex } from '@scure/base';

export function serializeBlockResponse(
  response: BlockResponseDb
): BlockResponseApi {
  const createdAt = getCreatedAt(response.id);
  return {
    ...response,
    networkKey: response.networkKey as NetworkKey,
    tenureExtendTimestamp: response.tenureExtendTimestamp
      ? response.tenureExtendTimestamp.toISOString()
      : null,
    createdAt: createdAt.toISOString(),
    signerPublicKey: response.signerPublicKey ?? '',
    accepted: response.accepted ?? true,
    version: response.version ?? undefined,
    reason: response.reason ?? undefined,
    validationCode: response.validationCode ?? undefined,
    rejectCode: response.rejectCode ?? undefined,
    rejectReason: response.rejectReason ?? undefined,
    latencyMs: response.latencyMs ?? undefined,
    blockHeight: response.blockHeight ?? undefined,
  };
}

export function serializeBlockPreCommit(
  preCommit: BlockPreCommitDb
): ApiBlockPreCommit {
  const createdAt = getCreatedAt(preCommit.id);
  return {
    id: preCommit.id,
    createdAt: createdAt.toISOString(),
    signerSignatureHash: preCommit.signerSignatureHash,
    signerPublicKey: preCommit.signerPublicKey,
    slotId: preCommit.slotId,
    networkKey: preCommit.networkKey as NetworkKey,
    latencyMs: preCommit.latencyMs ?? undefined,
    blockHeight: preCommit.blockHeight ?? undefined,
  };
}

export function serializeBurnBlock(block: BurnBlockDb): ApiBurnBlock {
  const createdAt = getCreatedAt(block.id);
  return {
    ...block,
    networkKey: block.networkKey as NetworkKey,
    createdAt: createdAt.toISOString(),
  };
}

export function serializeStacksBlock(block: StacksBlockDb): ApiStacksBlock {
  const createdAt = getCreatedAt(block.id);
  return {
    ...block,
    networkKey: block.networkKey as NetworkKey,
    burnBlockTimestamp: block.burnBlockTimestamp.toISOString(),
    blockTimestamp: (block.blockTimestamp ?? new Date()).toISOString(),
    processedAt: createdAt.toISOString(),
    consensusHash: block.consensusHash ?? '',
    indexBlockHash: block.indexBlockHash ?? '',
  };
}

function serializeMinerState(
  minerState: StateMachineUpdateMinerState
): ApiStateMachineMinerState {
  if (minerState.variant === 0) {
    return minerState;
  }
  return {
    ...minerState,
    parentTenureId: hex.encode(minerState.parentTenureId),
    tenureId: hex.encode(minerState.tenureId),
    currentMinerPkh: hex.encode(minerState.currentMinerPkh),
    parentTenureLastBlock: hex.encode(minerState.parentTenureLastBlock),
    parentTenureLastBlockHeight: Number(minerState.parentTenureLastBlockHeight),
  };
}

export function serializeStateMachineUpdate(
  update: StateMachineUpdateDb
): ApiStateMachineUpdate {
  const createdAt = getCreatedAt(update.id);
  const { updateContent, ...rest } = update;
  const content = superDeserialize(updateContent);
  const replayTxs = 'replayTxs' in content ? content.replayTxs : null;

  return {
    ...rest,
    networkKey: rest.networkKey as NetworkKey,
    burnBlock: hex.encode(content.burnBlock),
    burnBlockHeight: Number(content.burnBlockHeight),
    minerState: serializeMinerState(content.minerState),
    replayTxs,
    createdAt: createdAt.toISOString(),
  } satisfies ApiStateMachineUpdate;
}

export function serializeBlockProposal(
  block: BlockProposalDb
): ApiBlockProposal {
  const createdAt = getCreatedAt(block.id);
  return {
    ...block,
    networkKey: block.networkKey as NetworkKey,
    createdAt: createdAt.toISOString(),
    burnBlockHeight: block.burnBlockHeight ?? 0,
    consensusHash: block.consensusHash ?? '',
    minerPublicKey: block.minerPublicKey ?? '',
    ...getMinerIdentity(block.minerPublicKey),
    txCount: block.txCount ?? 0,
    serverVersionShort: block.serverVersion
      ? getVersionFromString(block.serverVersion)
      : null,
    serverVersion: block.serverVersion ?? null,
    blockTimestamp: (block.blockTimestamp || createdAt).toISOString(),
  };
}
