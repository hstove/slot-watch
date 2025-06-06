import type { StateMachineUpdateDb } from './schema';
import {
  type ApiStateMachineMinerState,
  type ApiStateMachineUpdate,
  type StateMachineUpdateMinerState,
  superDeserialize,
} from 'slot-watch-common';
import { hex } from '@scure/base';
import { getCreatedAt } from '../utils';

export function serializeMinerState(
  minerState: StateMachineUpdateMinerState,
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
  update: StateMachineUpdateDb,
): ApiStateMachineUpdate {
  const createdAt = getCreatedAt(update.id);
  const { updateContent, ...rest } = update;
  const content = superDeserialize(updateContent);
  const replayTxs = 'replayTxs' in content ? content.replayTxs : null;

  return {
    ...rest,
    burnBlock: hex.encode(content.burnBlock),
    burnBlockHeight: Number(content.burnBlockHeight),
    minerState: serializeMinerState(content.minerState),
    replayTxs,
    createdAt: createdAt.toISOString(),
  } satisfies ApiStateMachineUpdate;
}
