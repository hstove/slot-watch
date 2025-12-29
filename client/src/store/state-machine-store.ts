import { atom } from 'jotai';
import { listAtomWithInit } from './store-utils';
import {
  type ApiRecentSigners,
  // type ApiStateMachineUpdate,
  getStateMachineUpdates,
} from '../lib/slots-api';
import { percentString, type ApiStateMachineUpdate } from 'slot-watch-common';
import { networkIdAtom } from './network';
import { recentSignersAtom } from './signers-store';
import * as R from 'remeda';
import { dequal } from 'dequal';

export const [
  fetchLatestStateMachinesAtom,
  signerStateMachineFamily,
  signerStateMachineFamilyInner,
  latestStateMachinesAtom,
  setLatestStateMachinesAtom,
] = listAtomWithInit(
  async (get) => {
    const networkKey = get(networkIdAtom);
    const updates = await getStateMachineUpdates(networkKey);
    return updates.latestStateMachineUpdates;
  },
  (update) => {
    return update.signerPublicKey;
  },
  undefined,
  'state-machine-updates'
);

// biome-ignore lint/style/useConsistentTypeDefinitions: ignored using `--suppress`
export type FullSignerStateMachine = {
  signer: ApiRecentSigners['signers'][0];
  stateMachine: ApiStateMachineUpdate | undefined;
};

export const allSignersStateMachinesAtom = atom<FullSignerStateMachine[]>(
  (get) => {
    const signers = get(recentSignersAtom);
    const stateMachines = get(latestStateMachinesAtom);

    const signerStateMachines = signers.signers.map((signer) => {
      const signerStateMachine = stateMachines.find(
        (stateMachine) => stateMachine.signerPublicKey === signer.publicKey
      );
      return {
        signer,
        stateMachine: signerStateMachine,
      };
    });

    return signerStateMachines;
  }
);

function getBaseStateMachine(stateMachine: ApiStateMachineUpdate) {
  return {
    activeSignerProtocolVersion: stateMachine.activeSignerProtocolVersion,
    // localSignerProtocolVersion: stateMachine.localSignerProtocolVersion,
    // createdAt: stateMachine.createdAt,
    burnBlockHeight: stateMachine.burnBlockHeight,
    burnBlock: stateMachine.burnBlock,
    minerState: stateMachine.minerState,
    replayTxs: stateMachine.replayTxs,
    // chunkId: stateMachine.chunkId,
    // minerState: stateMachine.minerState,
  };
}

export type BaseStateMachine = ReturnType<typeof getBaseStateMachine>;

// biome-ignore lint/style/useConsistentTypeDefinitions: ignored using `--suppress`
export type GroupedStateMachine = {
  stateMachine: BaseStateMachine | null;
  signers: FullSignerStateMachine['signer'][];
  signerWeightPercentStr: string;
  signerWeightPercent: number;
};

export const groupedStateMachinesAtom = atom((get) => {
  const allSignersStateMachines = get(allSignersStateMachinesAtom);
  const grouped: [BaseStateMachine | null, FullSignerStateMachine[]][] = [];
  for (const signerStateMachine of allSignersStateMachines) {
    const baseStateMachine = signerStateMachine.stateMachine
      ? getBaseStateMachine(signerStateMachine.stateMachine)
      : null;
    const existingGroup = grouped.find(([base]) =>
      dequal(base, baseStateMachine)
    );
    if (existingGroup) {
      existingGroup[1].push(signerStateMachine);
    } else {
      grouped.push([baseStateMachine, [signerStateMachine]]);
    }
  }

  const mappedGroups: GroupedStateMachine[] = grouped.map(([base, signers]) => {
    const signerWeightPercent = signers.reduce(
      (acc, signer) => acc + signer.signer.weightPercent,
      0
    );
    const signerWeightPercentStr = percentString(signerWeightPercent);
    return {
      stateMachine: base,
      signers: signers.map(({ signer }) => signer),
      signerWeightPercentStr,
      signerWeightPercent,
    };
  });

  return R.sort(
    mappedGroups,
    (a, b) => b.signerWeightPercent - a.signerWeightPercent
  );
  // const grouped = R.groupBy(allSignersStateMachines, ({ signer, stateMachine }) => {
  //   if (!stateMachine) return null;

  // })
});
