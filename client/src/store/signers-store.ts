import { atom } from 'jotai';
import { networkIdAtom } from './network';
import type { RecentSigner } from 'slot-watch-common';
import { getSortableVersion } from 'slot-watch-common';
import { differenceInSeconds } from 'date-fns';
import {
  type ApiSigner,
  type ApiSigners,
  getRecentSigners,
} from '@/lib/slots-api';
import { atomFamily } from 'jotai/utils';
import { dequal } from 'dequal/lite';
import { setDebugLabel } from './store-utils';
import * as R from 'remeda';
import type { ChartConfig } from '@/components/ui/chart';
import { colord, extend } from 'colord';
import mixPlugin from 'colord/plugins/mix';

extend([mixPlugin]);

export const signersAtomFamilyInner = atomFamily(
  (_lookup: { publicKey: string; networkKey: string }) =>
    atom<ApiSigner | null>(null),
  dequal,
);

export const signersAtomFamily = atomFamily((publicKey: string) => {
  const a = atom((get) => {
    const networkKey = get(networkIdAtom);
    return get(signersAtomFamilyInner({ publicKey, networkKey }));
  });
  setDebugLabel(a, 'signer', publicKey);
  return a;
});

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

export type RecentSignerWithPower = RecentSigner;

export const recentSignersAtom = atom(async (get) => {
  const networkId = get(networkIdAtom);
  const signers = await getRecentSigners(networkId);
  const total = signers.signers.reduce((acc, signer) => acc + signer.weight, 0);
  return {
    ...signers,
    signers: signers.signers.map((signer) => {
      return {
        ...signer,
        versionCmp: getSortableVersion(signer.versionShort),
      };
    }),
    total,
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

export const signerVersionsAtom = atom(async (get) => {
  const recentSigners = await get(recentSignersAtom);
  const versions = R.groupBy(recentSigners.signers, (s) => {
    return s.versionCmp.join('.');
    // return s.versionShort;
  });

  return Object.entries(versions).map(([version, signers]) => {
    return {
      version,
      signers: signers.length,
    };
  });
});

export const signerVersionsChartAtom = atom(async (get) => {
  const versions = await get(signerVersionsAtom);
  const baseColor = colord('hsl(240 2% 26%)');
  const tints = baseColor.tints(versions.length);
  const chartConfig: ChartConfig = {
    version: {
      label: 'Version',
    },
  };
  let i = 0;
  for (const version of versions) {
    chartConfig[version.version] = {
      label: version.version,
      // color: `hsl(var(--chart-${i}))`,
      color: tints[i]?.toHex() ?? 'white',
    };
    i++;
  }
  const chartData = versions.map((v, i) => {
    return {
      version: v.version,
      signers: v.signers,
      // fill: `var(--color-${v.version})`,
      fill: tints[i]?.toHex() ?? 'white',
    };
  });
  return {
    chartConfig,
    chartData,
  };
});
