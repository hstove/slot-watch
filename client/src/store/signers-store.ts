import { atom } from 'jotai';
import { networkIdAtom } from './network';
import type { RecentSigner } from 'slot-watch-common';
import { getSortableVersion } from 'slot-watch-common';
import { differenceInSeconds } from 'date-fns';
import type { ApiRecentSigners, ApiSigner, ApiSigners } from '@/lib/slots-api';
import { atomFamily } from 'jotai/utils';
import { dequal } from 'dequal/lite';
import { setDebugLabel } from './store-utils';
import * as R from 'remeda';
import type { ChartConfig } from '@/components/ui/chart';
import { colord, extend } from 'colord';
import mixPlugin from 'colord/plugins/mix';
import {
  latestBlockHeightForSignerFamily,
  latestResponseTimeForSignerFamily,
  signerLatestResponseFamilyInner,
} from './responses-store';

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

export const recentSignersAtom = atom<ApiRecentSigners>({
  networkKey: '',
  rewardCycle: 0,
  totalWeight: 0,
  signers: [],
});

export type RecentSignerWithLatestResponse = RecentSigner & {
  totalWeight: number;
};

export const recentSignersWithLatestResponsesAtom = atom((get) => {
  const recentSigners = get(recentSignersAtom);

  return recentSigners.signers.map((signer) => {
    const response = get(latestResponseTimeForSignerFamily(signer.publicKey));
    const blockHeight = get(latestBlockHeightForSignerFamily(signer.publicKey));
    return {
      ...signer,
      createdAt: response ? new Date(response).toISOString() : signer.createdAt,
      totalWeight: recentSigners.totalWeight,
      blockHeight: blockHeight ?? undefined,
    };
  });
});

export const totalRecentSignersAtom = atom((get) => {
  const recentSigners = get(recentSignersAtom);
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

export const totalUpatedSignersAtom = atom((get) => {
  const recentSigners = get(recentSignersAtom);
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

export const useSignerVersionsWeightedAtom = atom(false);

export const signerVersionsAtom = atom((get) => {
  const recentSigners = get(recentSignersAtom);
  const versions = R.groupBy(recentSigners.signers, (s) => {
    return getSortableVersion(s.versionShort).join('.');
    // return s.versionShort;
  });
  const useWeighted = get(useSignerVersionsWeightedAtom);

  return Object.entries(versions).map(([version, signers]) => {
    if (useWeighted) {
      const totalWeight = signers.reduce(
        (acc, s) => acc + s.weightPercent * 100,
        0,
      );
      return {
        version,
        signers: Number.parseFloat(totalWeight.toFixed(1)),
      };
    }
    return {
      version,
      signers: signers.length,
    };
  });
});

export const signerVersionsChartAtom = atom((get) => {
  const versions = get(signerVersionsAtom);
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
