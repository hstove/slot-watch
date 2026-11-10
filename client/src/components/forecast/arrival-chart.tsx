import React from 'react';
import {
  Area,
  ComposedChart,
  Line,
  ReferenceArea,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  ArrivalDistribution,
  type ArrivalDistributionParams,
  type ArrivalForecast,
} from 'slot-watch-common';
import {
  formatAxisTime,
  formatDateTime,
  formatProbability,
  formatRelative,
} from '@/lib/btc-arrival';

const DENSITY_COLOR = '#f59e0b';
const CDF_COLOR = 'hsl(var(--foreground))';
const MUTED = 'hsl(var(--muted-foreground))';

interface ChartPoint {
  t: number;
  /** Density scaled so the peak is 1 (absolute units are per-second and unreadable). */
  density: number;
  /** Percent arrived by `t`. */
  cdf: number;
}

/**
 * Unnormalised log density of a single Gamma fitted to the 80% interval
 * (constant sigma80). `ArrivalDistribution.pdf` varies sigma with the
 * quantile level so it can hit both fitted intervals, which leaves a sharp
 * spike at the median for long horizons; that shape is an interpolation
 * artefact and reads as false precision. This curve has the same 80% range
 * and nearly the same median, so the shading stays honest while the
 * "arrived by" line and the tables keep the model's exact quantiles.
 */
function smoothLogDensity(params: ArrivalDistributionParams, t: number) {
  const { now, blocks: n, meanSeconds, sigma80 } = params;
  const x = (t - now) / (meanSeconds / n);
  if (!(x > 0)) return Number.NEGATIVE_INFINITY;
  const v = n + n * n * sigma80 * sigma80;
  const shape = (n * n) / v;
  const scale = v / n;
  return (shape - 1) * Math.log(x) - x / scale;
}

function ChartTooltip({
  active,
  payload,
  now,
}: {
  active?: boolean;
  payload?: { payload: ChartPoint }[];
  now: number;
}) {
  const point = payload?.[0]?.payload;
  if (!(active && point)) return null;
  return (
    <div className="border border-border bg-card p-2.5 font-mono text-[10px]">
      <div className="text-foreground">{formatDateTime(point.t)}</div>
      <div className="text-muted-foreground">
        {formatRelative(point.t, now)}
      </div>
      <div className="mt-1.5 border-t border-border pt-1.5">
        <span className="tabular-nums">
          {formatProbability(point.cdf / 100)}
        </span>{' '}
        <span className="text-muted-foreground">chance it has arrived</span>
      </div>
    </div>
  );
}

/**
 * Predictive density of the arrival time (shaded) with the cumulative
 * "arrived by" probability (line), the 80% / 95% ranges and the median.
 */
export function ArrivalChart({
  forecast,
  now,
  deadline,
}: {
  forecast: ArrivalForecast;
  now: number;
  deadline?: number | null;
}) {
  const data = React.useMemo(() => {
    const dist = ArrivalDistribution.fromParams(forecast.distribution);
    const curve = dist.densityCurve({ points: 160, pLo: 0.002, pHi: 0.998 });
    const shape = curve.map((p) =>
      smoothLogDensity(forecast.distribution, p.t)
    );
    const peak = Math.max(...shape);
    return curve.map(
      (p, i): ChartPoint => ({
        t: p.t,
        density: Math.exp((shape[i] ?? Number.NEGATIVE_INFINITY) - peak),
        cdf: p.cdf * 100,
      })
    );
  }, [forecast.distribution]);
  const t0 = data[0]?.t ?? forecast.q025;
  const t1 = data.at(-1)?.t ?? forecast.q975;
  const span = t1 - t0;
  const ticks = React.useMemo(() => {
    const out: number[] = [];
    // Inner ticks only: labels at the very edges get clipped.
    // Three fit at phone width with dated labels.
    for (let i = 0; i < 3; i++) out.push(t0 + (span * (2 * i + 1)) / 6);
    return out;
  }, [t0, span]);
  const inRange = (t: number | null | undefined): t is number =>
    t !== null && t !== undefined && t >= t0 && t <= t1;

  return (
    <div className="h-64 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart
          data={data}
          margin={{ top: 16, right: 8, bottom: 0, left: 8 }}
        >
          <XAxis
            dataKey="t"
            type="number"
            domain={[t0, t1]}
            ticks={ticks}
            tickFormatter={(t: number) => formatAxisTime(t, span)}
            tick={{ fontSize: 10, fontFamily: 'monospace', fill: MUTED }}
            stroke="hsl(var(--border))"
          />
          <YAxis yAxisId="density" hide domain={[0, 1.1]} />
          <YAxis
            yAxisId="cdf"
            orientation="right"
            domain={[0, 100]}
            ticks={[0, 50, 100]}
            tickFormatter={(v: number) => `${v}%`}
            tick={{ fontSize: 10, fontFamily: 'monospace', fill: MUTED }}
            stroke="hsl(var(--border))"
            width={36}
          />
          <ReferenceArea
            yAxisId="density"
            x1={forecast.q025}
            x2={forecast.q975}
            fill={DENSITY_COLOR}
            fillOpacity={0.06}
            ifOverflow="hidden"
          />
          <ReferenceArea
            yAxisId="density"
            x1={forecast.q10}
            x2={forecast.q90}
            fill={DENSITY_COLOR}
            fillOpacity={0.1}
            ifOverflow="hidden"
            label={{
              value: '80%',
              position: 'insideTopLeft',
              fontSize: 10,
              fontFamily: 'monospace',
              fill: MUTED,
            }}
          />
          <Area
            yAxisId="density"
            dataKey="density"
            type="monotone"
            stroke={DENSITY_COLOR}
            strokeWidth={1.5}
            fill={DENSITY_COLOR}
            fillOpacity={0.25}
            isAnimationActive={false}
            activeDot={false}
          />
          <Line
            yAxisId="cdf"
            dataKey="cdf"
            type="monotone"
            stroke={CDF_COLOR}
            strokeWidth={1}
            strokeDasharray="3 3"
            dot={false}
            isAnimationActive={false}
          />
          <ReferenceLine
            yAxisId="density"
            x={forecast.median}
            stroke={DENSITY_COLOR}
            strokeWidth={1.5}
            label={{
              value: 'median',
              position: 'top',
              fontSize: 10,
              fontFamily: 'monospace',
              fill: MUTED,
            }}
          />
          {inRange(now) ? (
            <ReferenceLine
              yAxisId="density"
              x={now}
              stroke={MUTED}
              label={{
                value: 'now',
                position: 'top',
                fontSize: 10,
                fontFamily: 'monospace',
                fill: MUTED,
              }}
            />
          ) : null}
          {inRange(deadline) ? (
            <ReferenceLine
              yAxisId="density"
              x={deadline}
              stroke="hsl(var(--chart-2))"
              strokeDasharray="4 2"
              label={{
                value: 'deadline',
                position: 'top',
                fontSize: 10,
                fontFamily: 'monospace',
                fill: 'hsl(var(--chart-2))',
              }}
            />
          ) : null}
          <Tooltip
            content={<ChartTooltip now={now} />}
            cursor={{ stroke: MUTED, strokeDasharray: '2 2' }}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
