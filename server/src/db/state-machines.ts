import type { StateMachineUpdateDb } from './schema';
import {
  type ApiStateMachineMinerState,
  type ApiStateMachineUpdate,
  type StateMachineUpdateMinerState,
  superDeserialize,
} from 'slot-watch-common';
import { hex } from '@scure/base';

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
  const updateContent = superDeserialize(update.updateContent);

  return {
    ...update,
    burnBlock: hex.encode(updateContent.burnBlock),
    burnBlockHeight: Number(updateContent.burnBlockHeight),
    minerState: serializeMinerState(updateContent.minerState),
  } satisfies ApiStateMachineUpdate;
}
