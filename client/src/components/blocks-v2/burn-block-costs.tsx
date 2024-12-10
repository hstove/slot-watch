import React from 'react';
import { useAtomValue } from 'jotai';
import { blockTenureCostsAtom } from '@/store/blocks-store';
import { costLimitsUsed, type MAINNET_COST_LIMITS } from '@/lib/costs';
import {
  statusStyles,
  statusVariants,
  type StatusVariants,
} from '@/lib/status-variants';
import { SimpleTooltip } from '../simple-tooltip';
import { percentString } from 'slot-watch-common';
import { cn } from '@/lib/utils';

function CostUsed({
  used,
  name,
  showPercent = true,
}: { used: number; name: string; showPercent?: boolean }) {
  const status: StatusVariants['status'] = React.useMemo(() => {
    if (used < 0.5) return 'success';
    if (used < 0.9) return 'warning';
    return 'error';
  }, [used]);

  const usedPercent = React.useMemo(() => {
    return percentString(used);
  }, [used]);

  const color = React.useMemo(() => {
    if (used < 0.5) return 'hsl(var(--success))';
    if (used < 0.9) return 'hsl(var(--warning))';
    return 'hsl(var(--error))';
  }, [used]);
  return (
    <SimpleTooltip content={`${name}${showPercent ? `: ${usedPercent}%` : ''}`}>
      <div
        className={statusStyles(
          status,
          'w-3 h-3 rounded-full transition-all duration-1000',
        )}
        style={{
          background: `conic-gradient(${color} 0% ${usedPercent}%, hsl(var(--secondary)) ${usedPercent}% 100%)`,
        }}
      />
    </SimpleTooltip>
  );
}

export const CostUsedBar = ({
  used,
  name,
}: { used: number; name: string; className?: string }) => {
  const status: StatusVariants['status'] = React.useMemo(() => {
    if (used < 0.5) return 'success';
    if (used < 0.9) return 'warning';
    return 'error';
  }, [used]);
  const usedPercent = React.useMemo(() => {
    return percentString(used);
  }, [used]);

  const color = React.useMemo(() => {
    if (used < 0.5) return 'hsl(var(--success))';
    if (used < 0.9) return 'hsl(var(--warning))';
    return 'hsl(var(--error))';
  }, [used]);

  return (
    <SimpleTooltip content={`${name}: ${usedPercent}%`}>
      <div className="flex flex-col align-end bg-secondary w-[8px] h-[14px]">
        <div
          style={{
            flexGrow: 1 - used,
          }}
        />
        <div
          className={statusStyles(
            status,
            'w-full transition-all duration-1000',
          )}
          style={{
            flexGrow: used,
          }}
        />
      </div>
    </SimpleTooltip>
  );
};

export const BurnBlockCosts = ({
  burnBlockHeight,
}: { burnBlockHeight: number }) => {
  const cost = useAtomValue(blockTenureCostsAtom(burnBlockHeight));
  // const used = costLimitsUsed(cost);
  return <BlockCosts costs={cost} />;
};

export interface BlockCostsProps extends React.HTMLAttributes<HTMLDivElement> {
  costs: typeof MAINNET_COST_LIMITS;
}

export const BlockCosts = ({ costs, className }: BlockCostsProps) => {
  const used = costLimitsUsed(costs);
  const allZero = Object.values(used).every((v) => v === 0);
  return (
    <div className={cn('flex gap-[1px]', className)}>
      {allZero ? (
        <CostUsed used={0} name="Zero cost" showPercent={false} />
      ) : (
        <>
          <CostUsedBar used={used.writeLength} name="Write Length" />
          <CostUsedBar used={used.writeCount} name="Write Count" />
          <CostUsedBar used={used.readLength} name="Read Length" />
          <CostUsedBar used={used.readCount} name="Read Count" />
          <CostUsedBar used={used.runtime} name="Runtime" />
        </>
      )}
    </div>
  );
};
