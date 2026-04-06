import React from 'react';
import { useAtomValue } from 'jotai';
import { responsesForBlockAtomFamily } from '@/store/blocks-store';
import { signersApiAtom } from '@/store/signers-store';
import {
  Area,
  AreaChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { getEntity } from '@/lib/local-signers';
import * as R from 'remeda';
import { loadable } from 'jotai/utils';

interface TimelinePoint {
  time: number;
  timeLabel: string;
  acceptPercent: number;
  rejectPercent: number;
  signers: { name: string; accepted: boolean; weightPercent: string }[];
}

function CustomTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: { payload: TimelinePoint }[];
  label?: string;
}) {
  // biome-ignore lint/complexity/useSimplifiedLogicExpression: allowed
  if (!active || !payload?.[0]) return null;
  const data = payload[0].payload;
  return (
    <div className="border border-border bg-card p-3 font-mono text-xs max-w-[280px]">
      <div className="text-muted-foreground mb-2">{data.timeLabel}</div>
      <div className="flex gap-4 mb-2">
        <span className="text-green-600">
          {data.acceptPercent.toFixed(1)}% approved
        </span>
        <span className="text-red-600">
          {data.rejectPercent.toFixed(1)}% rejected
        </span>
      </div>
      {data.signers.length > 0 && (
        <div className="border-t border-border pt-2 space-y-1">
          {data.signers.map((s, i) => (
            <div key={i} className="flex justify-between gap-2">
              <span className={s.accepted ? 'text-green-600' : 'text-red-600'}>
                {s.accepted ? '✓' : '✗'} {s.name}
              </span>
              <span className="text-muted-foreground">{s.weightPercent}%</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function ResponseTimelineChart({ blockHash }: { blockHash: string }) {
  const responsesLoadable = useAtomValue(
    loadable(responsesForBlockAtomFamily(blockHash))
  );
  const signers = useAtomValue(signersApiAtom);

  // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: allowed
  const data = React.useMemo(() => {
    if (responsesLoadable.state !== 'hasData' || !signers) return null;
    const responses = responsesLoadable.data;
    if (responses.length === 0) return null;

    const totalWeight = signers.totalWeight;
    const signerWeightMap = new Map(
      signers.signers.map((s) => [s.publicKey, s])
    );

    const sorted = R.pipe(
      responses,
      R.filter((r) => !!r.createdAt),
      R.sortBy((r) => new Date(r.createdAt).getTime())
    );

    if (sorted.length === 0) return null;

    // Group by timestamp (multiple signers respond at same time)
    const groups = R.groupBy(sorted, (r) => r.createdAt);
    const timestamps = Object.keys(groups).sort(
      (a, b) => new Date(a).getTime() - new Date(b).getTime()
    );

    const baseTime = new Date(timestamps[0]).getTime();
    let cumulativeAccept = 0;
    let cumulativeReject = 0;

    const points: TimelinePoint[] = [
      {
        time: 0,
        timeLabel: '0s',
        acceptPercent: 0,
        rejectPercent: 0,
        signers: [],
      },
    ];

    for (const ts of timestamps) {
      const batch = groups[ts];
      const batchSigners: TimelinePoint['signers'] = [];

      for (const r of batch) {
        const signer = signerWeightMap.get(r.signerPublicKey);
        if (!signer) continue;
        const weightPct = (signer.weight / totalWeight) * 100;
        if (r.accepted) {
          cumulativeAccept += weightPct;
        } else {
          cumulativeReject += weightPct;
        }
        batchSigners.push({
          name:
            getEntity(r.signerPublicKey) ?? `${r.signerPublicKey.slice(0, 8)}…`,
          accepted: r.accepted,
          weightPercent: weightPct.toFixed(1),
        });
      }

      const elapsed = new Date(ts).getTime() - baseTime;
      const seconds = elapsed / 1000;
      const timeLabel =
        seconds < 60
          ? `${seconds.toFixed(1)}s`
          : `${(seconds / 60).toFixed(1)}m`;

      points.push({
        time: elapsed,
        timeLabel,
        acceptPercent: Math.min(cumulativeAccept, 100),
        rejectPercent: Math.min(cumulativeReject, 100),
        signers: batchSigners,
      });
    }

    return points;
  }, [responsesLoadable, signers]);

  if (!data || data.length <= 1) return null;

  const maxTime = data.at(-1)?.time ?? 0;

  return (
    <div className="space-y-3">
      <h2 className="font-mono text-sm font-medium">Response Timeline</h2>
      <div className="border border-border bg-card p-4">
        <ResponsiveContainer width="100%" height={200}>
          <AreaChart
            data={data}
            margin={{ top: 8, right: 8, bottom: 0, left: 0 }}
          >
            <defs>
              <linearGradient id="acceptGrad" x1="0" y1="0" x2="0" y2="1">
                <stop
                  offset="0%"
                  stopColor="oklch(0.723 0.219 149.579)"
                  stopOpacity={0.3}
                />
                <stop
                  offset="100%"
                  stopColor="oklch(0.723 0.219 149.579)"
                  stopOpacity={0.05}
                />
              </linearGradient>
              <linearGradient id="rejectGrad" x1="0" y1="0" x2="0" y2="1">
                <stop
                  offset="0%"
                  stopColor="oklch(0.637 0.237 25.331)"
                  stopOpacity={0.3}
                />
                <stop
                  offset="100%"
                  stopColor="oklch(0.637 0.237 25.331)"
                  stopOpacity={0.05}
                />
              </linearGradient>
            </defs>
            <XAxis
              dataKey="time"
              type="number"
              domain={[0, maxTime]}
              tickFormatter={(v: number) => {
                const s = v / 1000;
                return s < 60 ? `${s.toFixed(0)}s` : `${(s / 60).toFixed(1)}m`;
              }}
              tick={{ fontSize: 11, fontFamily: 'monospace' }}
              stroke="hsl(var(--border))"
              tickLine={false}
            />
            <YAxis
              domain={[0, 100]}
              tickFormatter={(v: number) => `${v}%`}
              tick={{ fontSize: 11, fontFamily: 'monospace' }}
              stroke="hsl(var(--border))"
              tickLine={false}
              width={45}
            />
            <ReferenceLine
              y={70}
              stroke="oklch(0.723 0.219 149.579)"
              strokeDasharray="4 4"
              strokeOpacity={0.6}
              label={{
                value: '70%',
                position: 'right',
                fill: 'oklch(0.723 0.219 149.579)',
                fontSize: 11,
                fontFamily: 'monospace',
              }}
            />
            <ReferenceLine
              y={30}
              stroke="oklch(0.637 0.237 25.331)"
              strokeDasharray="4 4"
              strokeOpacity={0.6}
              label={{
                value: '30%',
                position: 'right',
                fill: 'oklch(0.637 0.237 25.331)',
                fontSize: 11,
                fontFamily: 'monospace',
              }}
            />
            <Tooltip
              content={<CustomTooltip />}
              cursor={{ stroke: 'hsl(var(--border))' }}
            />
            <Area
              type="stepAfter"
              dataKey="acceptPercent"
              stroke="oklch(0.723 0.219 149.579)"
              fill="url(#acceptGrad)"
              strokeWidth={1.5}
              dot={false}
              activeDot={{
                r: 3,
                strokeWidth: 0,
                fill: 'oklch(0.723 0.219 149.579)',
              }}
              isAnimationActive={false}
            />
            <Area
              type="stepAfter"
              dataKey="rejectPercent"
              stroke="oklch(0.637 0.237 25.331)"
              fill="url(#rejectGrad)"
              strokeWidth={1.5}
              dot={false}
              activeDot={{
                r: 3,
                strokeWidth: 0,
                fill: 'oklch(0.637 0.237 25.331)',
              }}
              isAnimationActive={false}
            />
          </AreaChart>
        </ResponsiveContainer>
        <div className="flex gap-4 mt-2 font-mono text-xs text-muted-foreground justify-center">
          <span className="flex items-center gap-1.5">
            <span className="w-3 h-[2px] bg-green-600 inline-block" />
            approved
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-3 h-[2px] bg-red-600 inline-block" />
            rejected
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-3 h-[1px] border-t border-dashed border-green-600 inline-block" />
            70% threshold
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-3 h-[1px] border-t border-dashed border-red-600 inline-block" />
            30% threshold
          </span>
        </div>
      </div>
    </div>
  );
}
