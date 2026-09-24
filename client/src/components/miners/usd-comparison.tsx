import {
  formatUsd,
  grossMarginPercent,
  type UsdTotals,
} from '@/lib/miner-economics';
import { Metric } from './miner-overview';

function coverageDetail(
  pricedUsd: number | null,
  missing: number,
  unit: string
) {
  return missing
    ? `${formatUsd(pricedUsd, true)} priced · ${missing.toLocaleString()} unpriced ${unit}`
    : 'hourly open at observed burn block';
}

export function UsdComparison({
  totals,
  fromHeight,
  toHeight,
}: {
  totals: UsdTotals | null;
  fromHeight: number;
  toHeight: number;
}) {
  const net =
    totals?.spendUsd != null && totals.revenueUsd != null
      ? totals.revenueUsd - totals.spendUsd
      : null;
  const margin = totals
    ? grossMarginPercent(totals.spendUsd, totals.revenueUsd)
    : null;
  const blocks = Math.max(0, toHeight - fromHeight + 1);

  return (
    <div className="border-t border-border">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 border-b border-border bg-muted/20 px-3 py-2 font-mono text-[10px]">
        <span className="uppercase tracking-wider text-muted-foreground">
          matured USD comparison
        </span>
        <span className="tabular-nums text-muted-foreground">
          btc {fromHeight.toLocaleString()} – {toHeight.toLocaleString()} ·{' '}
          {blocks.toLocaleString()} blocks
        </span>
      </div>
      {totals && blocks ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
          <Metric
            label="btc spent · usd"
            value={formatUsd(totals.spendUsd, true)}
            detail={coverageDetail(
              totals.pricedSpendUsd,
              totals.spendPriceMissing,
              'commits'
            )}
          />
          <Metric
            label="stx earned · usd"
            value={formatUsd(totals.revenueUsd, true)}
            detail={coverageDetail(
              totals.pricedRevenueUsd,
              totals.revenuePriceMissing,
              'rewards'
            )}
          />
          <Metric
            label="net · usd"
            value={formatUsd(net, true)}
            detail="earned less spent"
          />
          <Metric
            label="gross margin"
            value={margin === null ? '–' : `${margin.toFixed(1)}%`}
            detail="net ÷ earned"
          />
        </div>
      ) : (
        <div className="px-3 py-3 font-mono text-xs text-muted-foreground">
          {blocks
            ? 'no miner activity in the matured range'
            : 'no matured blocks in this window yet'}
        </div>
      )}
      <div className="border-t border-border px-3 py-2 font-mono text-[10px] text-muted-foreground">
        Coinbase hourly opens at the earning block’s observed time · matured
        rewards only · excludes other mining costs and sale timing
      </div>
    </div>
  );
}
