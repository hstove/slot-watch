import type React from 'react';
import type { ArrivalForecast } from 'slot-watch-common';
import {
  type BaselineForecast,
  formatDateTime,
  formatDuration,
  formatPace,
  type PaceStat,
  parsePace,
  RETARGET_INTERVAL,
  TARGET_BLOCK_SECONDS,
} from '@/lib/btc-arrival';
import { cn } from '@/lib/utils';

export const DEFAULT_PACE = formatPace(TARGET_BLOCK_SECONDS);

const fmt = (n: number) => n.toLocaleString();

function Label({ children }: { children: React.ReactNode }) {
  return (
    <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
      {children}
    </span>
  );
}

function Row({
  label,
  value,
  sub,
}: {
  label: string;
  value: React.ReactNode;
  sub?: string;
}) {
  return (
    <div className="border-b border-border/50 py-1 font-mono text-xs last:border-b-0">
      <div className="flex justify-between gap-3">
        <span className="text-muted-foreground">{label}</span>
        <span className="text-right tabular-nums">{value}</span>
      </div>
      {sub ? (
        <div className="text-right text-[10px] tabular-nums text-muted-foreground">
          {sub}
        </div>
      ) : null}
    </div>
  );
}

function PaceInput({
  id,
  label,
  value,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  const invalid = parsePace(value) === null;
  return (
    <div className="mb-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 pr-2">
      <label htmlFor={id}>
        <Label>{label}</Label>
      </label>
      <span className="flex items-center gap-1">
        <input
          id={id}
          value={value}
          inputMode="numeric"
          autoComplete="off"
          aria-invalid={invalid}
          onChange={(e) => onChange(e.target.value)}
          className={cn(
            'h-7 w-16 border bg-transparent px-2 font-mono text-xs tabular-nums focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring',
            invalid ? 'border-destructive' : 'border-input'
          )}
        />
        <span className="font-mono text-[10px] text-muted-foreground">
          min/blk
        </span>
      </span>
    </div>
  );
}

function SegmentBar({
  from,
  to,
  fillTo,
  marker,
}: {
  from: number;
  to: number;
  /** Mined through this height (inclusive); null for no fill. */
  fillTo: number | null;
  /** Target height inside this segment, or null. */
  marker: number | null;
}) {
  const len = to - from + 1;
  const pct = (h: number) =>
    Math.min(100, Math.max(0, ((h - from) / len) * 100));
  return (
    <div className="relative h-5 border border-sky-500/50 bg-sky-500/5">
      {fillTo !== null ? (
        <div
          className="absolute inset-y-0 left-0 bg-sky-500/50"
          style={{ width: `${pct(fillTo + 1)}%` }}
        />
      ) : null}
      {marker !== null ? (
        <div
          className="absolute inset-y-0 w-0.5 -translate-x-1/2 bg-foreground"
          style={{ left: `${pct(marker + 0.5)}%` }}
          title={`block ${fmt(marker)}`}
        />
      ) : null}
    </div>
  );
}

/**
 * The current difficulty epoch as a progress bar (and the next one, when the
 * target is past the retarget), with each pace input above its segment.
 */
function EpochBar({
  forecast,
  paceUntil,
  paceAfter,
  onPaceUntil,
  onPaceAfter,
}: {
  forecast: ArrivalForecast;
  paceUntil: string;
  paceAfter: string;
  onPaceUntil: (value: string) => void;
  onPaceAfter: (value: string) => void;
}) {
  const { tipHeight: tip, targetHeight: target } = forecast;
  const { retarget } = forecast.components;
  const epochStart = retarget.height - RETARGET_INTERVAL;
  const epoch = epochStart / RETARGET_INTERVAL;
  const past = target >= retarget.height;
  const nextEnd = retarget.height + RETARGET_INTERVAL - 1;
  const beyond = target > nextEnd;
  const change = retarget.projectedDifficultyChangePct;
  const index = past ? target - retarget.height + 1 : target - epochStart + 1;
  return (
    <div className="min-w-0">
      <div className="mb-1.5 flex flex-wrap items-baseline justify-between gap-x-3 font-mono text-xs">
        <span>
          epoch {epoch}{' '}
          <span className="text-[10px] text-muted-foreground">
            {fmt(tip - epochStart + 1)}/{fmt(RETARGET_INTERVAL)} mined
          </span>
        </span>
        <span className="text-[10px] text-muted-foreground">
          {beyond
            ? `target beyond epoch ${epoch + 1}`
            : `target block ${fmt(index)} of epoch ${past ? epoch + 1 : epoch}`}
        </span>
      </div>
      <div className={cn('grid', past ? 'grid-cols-2' : 'grid-cols-1')}>
        <div className="min-w-0">
          <PaceInput
            id="baseline-pace-until"
            label="until retarget"
            value={paceUntil}
            onChange={onPaceUntil}
          />
          <SegmentBar
            from={epochStart}
            to={retarget.height - 1}
            fillTo={tip}
            marker={past ? null : target}
          />
        </div>
        {past ? (
          <div className="min-w-0 border-l-2 border-foreground/60">
            <div className="pl-2">
              <PaceInput
                id="baseline-pace-after"
                label="after retarget"
                value={paceAfter}
                onChange={onPaceAfter}
              />
            </div>
            <SegmentBar
              from={retarget.height}
              to={nextEnd}
              fillTo={null}
              marker={beyond ? null : target}
            />
          </div>
        ) : null}
      </div>
      <div className="mt-1 flex justify-between gap-x-3 font-mono text-[10px] tabular-nums text-muted-foreground">
        <span>{fmt(epochStart)}</span>
        <span>{fmt(past ? nextEnd : retarget.height - 1)}</span>
      </div>
      <div
        className="mt-0.5 font-mono text-[10px] tabular-nums"
        title="projected from the model's current-epoch pace"
      >
        retarget {fmt(retarget.height)} ·{' '}
        {formatDateTime(retarget.projectedTime)} · {change >= 0 ? '+' : ''}
        {change.toFixed(2)}% difficulty
      </div>
      {past ? null : (
        <div className="mt-1 font-mono text-[10px] text-muted-foreground">
          the target is before the retarget, so only the current-epoch pace
          applies
        </div>
      )}
    </div>
  );
}

function band(stat: PaceStat | null) {
  if (!stat) return undefined;
  return `95%: ${formatPace(stat.lo)} to ${formatPace(stat.hi)} · ${fmt(stat.blocks)} blk`;
}

function modelDelta(model: number, baseline: number) {
  const diff = model - baseline;
  if (Math.abs(diff) < 60) return 'model and baseline agree';
  return `model is ${formatDuration(diff)} ${diff > 0 ? 'later' : 'earlier'}`;
}

/**
 * A fixed-pace baseline next to the model, defaulting to 10:00 per block from
 * now, with the epoch bar and recent block times that inform the pace.
 */
export interface BaselineControls {
  paceUntil: string;
  paceAfter: string;
  onPaceUntil: (value: string) => void;
  onPaceAfter: (value: string) => void;
  trailing: PaceStat | null;
  epochAvg: PaceStat | null;
}

export function BaselineRow({
  forecast,
  baseline,
  controls,
}: {
  forecast: ArrivalForecast;
  baseline: BaselineForecast | null;
  controls: BaselineControls;
}) {
  const { paceUntil, paceAfter, onPaceUntil, onPaceAfter, trailing, epochAvg } =
    controls;
  const isDefault = paceUntil === DEFAULT_PACE && paceAfter === DEFAULT_PACE;
  const measured = forecast.components.hashratePace.measuredSecondsPerBlock;
  const change = forecast.components.retarget.projectedDifficultyChangePct;
  return (
    <div className="grid grid-cols-1 gap-x-6 gap-y-4 px-3 py-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)_minmax(0,1fr)]">
      <div className="min-w-0">
        <div className="mb-1.5">
          <Label>
            {isDefault ? '10 min baseline' : 'custom pace baseline'}
          </Label>
        </div>
        {baseline ? (
          <>
            <div className="font-mono text-xs">
              <span className="mr-2 text-muted-foreground">median</span>
              {formatDateTime(baseline.median)}
            </div>
            <div className="mt-1 space-y-0.5 font-mono text-xs tabular-nums">
              <div>
                <span className="mr-2 text-muted-foreground">80%</span>
                {formatDateTime(baseline.q10)} – {formatDateTime(baseline.q90)}
              </div>
              <div>
                <span className="mr-2 text-muted-foreground">95%</span>
                {formatDateTime(baseline.q025)} –{' '}
                {formatDateTime(baseline.q975)}
              </div>
            </div>
            <div className="mt-1.5 font-mono text-xs text-sky-600 dark:text-sky-400">
              {modelDelta(forecast.median, baseline.median)}
            </div>
          </>
        ) : (
          <div className="font-mono text-xs text-destructive">
            enter a pace like 9:45
          </div>
        )}
        <div className="mt-2 flex gap-1">
          <button
            type="button"
            disabled={!epochAvg}
            onClick={() => epochAvg && onPaceUntil(formatPace(epochAvg.mean))}
            title="fill 'until retarget' with the average block time since this epoch started"
            className="border border-border px-2 py-0.5 font-mono text-[10px] text-muted-foreground transition-colors hover:bg-muted/30 hover:text-foreground disabled:opacity-40"
          >
            use epoch avg
          </button>
          <button
            type="button"
            disabled={isDefault}
            onClick={() => {
              onPaceUntil(DEFAULT_PACE);
              onPaceAfter(DEFAULT_PACE);
            }}
            className="border border-border px-2 py-0.5 font-mono text-[10px] text-muted-foreground transition-colors hover:bg-muted/30 hover:text-foreground disabled:opacity-40"
          >
            reset
          </button>
        </div>
      </div>
      <div className="min-w-0">
        <div className="mb-1.5">
          <Label>difficulty epoch</Label>
        </div>
        <EpochBar
          forecast={forecast}
          paceUntil={paceUntil}
          paceAfter={paceAfter}
          onPaceUntil={onPaceUntil}
          onPaceAfter={onPaceAfter}
        />
      </div>
      <div className="min-w-0">
        <div className="mb-1.5">
          <Label>block times</Label>
        </div>
        <Row
          label="last 100 blocks"
          value={trailing ? formatPace(trailing.mean) : '–'}
          sub={band(trailing)}
        />
        <Row
          label="since epoch start"
          value={epochAvg ? formatPace(epochAvg.mean) : '–'}
          sub={band(epochAvg)}
        />
        <Row
          label="model measured pace"
          value={measured === null ? 'no history' : formatPace(measured)}
        />
        <Row
          label="projected difficulty"
          value={`${change >= 0 ? '+' : ''}${change.toFixed(2)}%`}
        />
        <div className="mt-1.5 font-sans text-[10px] leading-snug text-muted-foreground">
          100 blocks is recent context only: a reading inside its band is
          consistent with no hashrate change. The epoch average is what the
          retarget acts on.
        </div>
      </div>
    </div>
  );
}
