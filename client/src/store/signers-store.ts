import { atom } from 'jotai';
import { networkIdAtom } from './network';
import {
  getStackerSet,
  getCoreNodeInfo,
  getPoxInfo,
  type RecentSignersResponse,
  type RecentSigner,
} from 'slot-watch-common';
import { differenceInSeconds } from 'date-fns';
import {
  type ApiSigner,
  type ApiSigners,
  getRecentSigners,
} from '@/lib/slots-api';
import { getSigners } from '@/lib/slots-api';
import { atomFamily } from 'jotai/utils';
import { dequal } from 'dequal/lite';

export const poxInfoAtom = atom(async (get) => {
  const networkId = get(networkIdAtom);
  return getPoxInfo(networkId);
});

export const rewardCycleAtom = atom(async (get) => {
  const poxInfo = await get(poxInfoAtom);
  return poxInfo.reward_cycle_id;
});

export const stackerSetAtom = atom(async (get) => {
  const rewardCycle = await get(rewardCycleAtom);
  const networkId = get(networkIdAtom);
  return getStackerSet(networkId, rewardCycle);
});

export const signersAtomFamilyInner = atomFamily(
  (_lookup: { publicKey: string; networkKey: string }) =>
    atom<ApiSigner | null>(null),
  dequal,
);

export const signersAtomFamily = atomFamily((publicKey: string) =>
  atom((get) => {
    const networkKey = get(networkIdAtom);
    return get(signersAtomFamilyInner({ publicKey, networkKey }));
  }),
);

export const setSignersApiAtom = atom(
  null,
  async (_get, set, signers: ApiSigners, networkKey: string) => {
    for (const signer of signers.signers) {
      set(
        signersAtomFamilyInner({ publicKey: signer.publicKey, networkKey }),
        signer,
      );
    }
    set(signersApiAtom, signers);
  },
);

export const signersApiAtom = atom<ApiSigners>();

export const totalWeightAtom = atom((get) => {
  const signers = get(signersApiAtom);
  return signers?.totalWeight ?? 1;
});

export const thresholdAtom = atom((get) => {
  const totalWeight = get(totalWeightAtom);
  return Math.ceil(totalWeight * 0.7);
});

export const signersAtom = atom((get) => {
  const signers = get(signersApiAtom);
  return signers?.signers ?? [];
});

export type RecentSignerWithPower = RecentSigner;

export const recentSignersAtom = atom(async (get) => {
  const networkId = get(networkIdAtom);
  const signers = await getRecentSigners(networkId);
  const total = signers.signers.reduce((acc, signer) => acc + signer.weight, 0);
  return {
    ...signers,
    total,
    // signers: signers.signers.map(
    // 	(signer) =>
    // 		({
    // 			...signer,
    // 			power: signer.weight / total,
    // 		}) satisfies RecentSignerWithPower,
    // ),
  };
});

export const totalRecentSignersAtom = atom(async (get) => {
  const recentSigners = await get(recentSignersAtom);
  let total = 0;
  let numSigners = 0;
  for (const signer of recentSigners.signers) {
    if (!signer.createdAt) continue;
    const secondAgo = differenceInSeconds(new Date(), signer.createdAt);
    if (secondAgo > 60 * 10) continue;
    total += signer.weight;
    numSigners++;
  }
  const percent = (total / recentSigners.totalWeight) * 10000;
  const percentString = Math.round(percent) / 100;
  return {
    percentStr: percentString,
    percent,
    weight: total,
    total: recentSigners.totalWeight,
    numSigners,
  };
});

export const totalUpatedSignersAtom = atom(async (get) => {
  const recentSigners = await get(recentSignersAtom);
  let total = 0;
  let numSigners = 0;
  for (const signer of recentSigners.signers) {
    if (!signer.createdAt) continue;
    total += signer.weight;
    numSigners++;
  }
  const percent = (total / recentSigners.totalWeight) * 10000;
  const percentString = Math.round(percent) / 100;
  return {
    percentStr: percentString,
    percent,
    weight: total,
    total: recentSigners.totalWeight,
    numSigners,
  };
});
