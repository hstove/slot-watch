import React from 'react';
import { useAtom, useAtomValue } from 'jotai';
import {
  recentSignersAtom,
  recentSignersWithLatestResponsesAtom,
  totalRecentSignersAtom,
  useSignerVersionsWeightedAtom,
} from '@/store/signers-store';
import { networkIdAtom } from '@/store/network';
import { VersionsChart } from './versions-chart';
import { Route } from '../../routes/signers';
import { SignerBarItem } from './signer-bar-item';
import { SignersTable } from './signers-table';

const MAINNET_LAUNCHED = true;

function Metric({
  label,
  value,
  detail,
}: {
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <div className="border-b border-border px-3 py-2.5 last:border-b-0 sm:border-r sm:border-b-0 sm:last:border-r-0">
      <div className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
        {label}
      </div>
      <div className="mt-1 font-mono text-xl font-semibold leading-none tracking-tight tabular-nums">
        {value}
      </div>
      <div className="mt-1.5 font-mono text-[10px] text-muted-foreground">
        {detail}
      </div>
    </div>
  );
}

export const RecentSigners = () => {
  const totalRecents = useAtomValue(totalRecentSignersAtom);
  const networkId = useAtomValue(networkIdAtom);
  const loaderData = Route.useLoaderData();
  const [recentSigners, setRecentSigners] = useAtom(recentSignersAtom);
  const recentSignersWithLatestResponses = useAtomValue(
    recentSignersWithLatestResponsesAtom
  );
  const [useWeighted, setUseWeighted] = useAtom(useSignerVersionsWeightedAtom);
  const showCustom = !MAINNET_LAUNCHED && networkId === 'mainnet';
  React.useEffect(() => {
    setRecentSigners(loaderData.signers);
  }, [loaderData, setRecentSigners]);

  if (!recentSigners) return null;

  const totalWeight = recentSigners.totalWeight || 1;
  const weightedHealth = recentSignersWithLatestResponses.reduce(
    (total, signer) => total + signer.weight * (1 - signer.degradation50),
    0
  );
  const weightedHealthPercent = Number(
    ((weightedHealth / totalWeight) * 100).toFixed(1)
  );

  return (
    <div className="flex flex-col gap-2">
      <section className="border border-border bg-card">
        <div className="grid grid-cols-1 sm:grid-cols-3">
          <Metric
            label="active power"
            value={`${totalRecents.percentStr}%`}
            detail="seen within 10 minutes"
          />
          <Metric
            label="active signers"
            value={`${totalRecents.numSigners}/${recentSigners.signers.length}`}
            detail="responding roster slots"
          />
          <Metric
            label="network health"
            value={`${weightedHealthPercent}%`}
            detail="weight-adjusted · 50 proposals"
          />
        </div>

        <div className="grid border-t border-border md:grid-cols-[minmax(16rem,0.9fr)_minmax(0,1.6fr)]">
          <div className="border-b border-border px-3 py-2.5 md:border-r md:border-b-0">
            <div className="mb-2 flex items-center justify-between">
              <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                version mix
              </span>
              <button
                type="button"
                className="border border-border px-1.5 py-0.5 font-mono text-[9px] uppercase text-muted-foreground transition-colors hover:bg-muted/30 hover:text-foreground"
                onClick={() => setUseWeighted((current) => !current)}
              >
                {useWeighted ? 'by weight' : 'by signer'}
              </button>
            </div>
            <React.Suspense>
              <VersionsChart />
            </React.Suspense>
          </div>

          {showCustom ? null : (
            <div className="px-3 py-2.5">
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                  signing power by activity
                </span>
                <div className="flex items-center gap-3 font-mono text-[9px] text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <i className="h-1.5 w-1.5 bg-green-600" /> active
                  </span>
                  <span className="flex items-center gap-1">
                    <i className="h-1.5 w-1.5 bg-amber-600" /> aging
                  </span>
                  <span className="flex items-center gap-1">
                    <i className="h-1.5 w-1.5 bg-red-600" /> stale
                  </span>
                </div>
              </div>
              <div className="flex h-4 w-full gap-px overflow-hidden bg-muted">
                {recentSignersWithLatestResponses.map((signer) => (
                  <SignerBarItem key={signer.publicKey} signer={signer} />
                ))}
              </div>
              <div className="mt-1.5 flex justify-between font-mono text-[9px] text-muted-foreground">
                <span>slot 00</span>
                <span>width = signing power</span>
                <span>slot {recentSigners.signers.length - 1}</span>
              </div>
            </div>
          )}
        </div>
      </section>
      <SignersTable
        signers={recentSignersWithLatestResponses}
        rewardCycle={recentSigners.rewardCycle}
      />
    </div>
  );
};
