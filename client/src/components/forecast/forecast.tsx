import React from 'react';
import { Link, useNavigate } from '@tanstack/react-router';
import {
  ArrivalDistribution,
  type ArrivalForecast,
  MAX_HORIZON_BLOCKS,
} from 'slot-watch-common';
import { Route } from '@/routes/forecast';
import {
  baselineForecast,
  HALVING_INTERVAL,
  paceStat,
  parsePace,
  type Milestone,
  nextCycleStart,
  type PoxParams,
  RETARGET_INTERVAL,
  forecastFor,
  formatCountdown,
  formatDate,
  formatDateTime,
  formatDuration,
  formatProbability,
  formatRelative,
  formatTime,
  fromDateTimeLocal,
  heightAtTime,
  poxPosition,
  toDateTimeLocal,
  upcomingMilestones,
} from '@/lib/btc-arrival';
import { cn } from '@/lib/utils';
import { type Bond, upcomingBonds } from '@/lib/bonds';
import { ArrivalChart } from './arrival-chart';
import { type BaselineControls, BaselineRow, DEFAULT_PACE } from './baseline';
import { DateTimeField } from './date-time-field';
import { ScheduleStatus } from './schedule-status';
import {
  type MinedLookup,
  type ModelState,
  useArrivalData,
  useMinedLookup,
  useModel,
  useModelNow,
  useNow,
  useBondSchedule,
  useRecentBlockTimes,
} from './use-live-arrival';

const LADDER = [0.05, 0.1, 0.25, 0.5, 0.75, 0.9, 0.95];
const INPUT_DEBOUNCE_MS = 300;
const TABLE_FILTERS = ['all', 'cycle', 'bond', 'bitcoin'] as const;
type TableFilter = (typeof TABLE_FILTERS)[number];
const FILTER_LABELS: Record<TableFilter, string> = {
  all: 'all',
  cycle: 'staking cycles',
  bond: 'bonds',
  bitcoin: 'bitcoin',
};

interface Chip {
  label: string;
  height: number;
}

/** Quick picks above the height input; each names one event even when rows merge. */
function quickPicks(
  tip: number,
  pox: PoxParams | null,
  bonds: readonly Bond[]
): Chip[] {
  const chips: Chip[] = [{ label: 'next block', height: tip + 1 }];
  const cycle = nextCycleStart(tip, pox);
  const pos = pox ? poxPosition(tip, pox) : null;
  if (cycle !== null && pos && pox) {
    chips.push({ label: 'next staking cycle', height: cycle });
    chips.push({
      label: 'next prepare phase',
      height: pos.inPrepare
        ? pos.prepareStart + pox.rewardCycleLength
        : pos.prepareStart,
    });
  }
  const bond = bonds[0];
  if (bond) {
    chips.push({
      label: `bond ${bond.index} enrollment closes`,
      height: bond.enrollmentCutoff,
    });
  }
  chips.push({
    label: 'difficulty adjustment',
    height: (Math.floor(tip / RETARGET_INTERVAL) + 1) * RETARGET_INTERVAL,
  });
  chips.push({
    label: 'halving',
    height: (Math.floor(tip / HALVING_INTERVAL) + 1) * HALVING_INTERVAL,
  });
  return chips;
}

function PanelLabel({ children }: { children: React.ReactNode }) {
  return (
    <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
      {children}
    </span>
  );
}

function DataRow({
  label,
  value,
  title,
}: {
  label: string;
  value: React.ReactNode;
  title?: string;
}) {
  return (
    <div
      className="flex justify-between gap-4 border-b border-border/50 py-1.5 text-xs last:border-b-0"
      title={title}
    >
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right font-mono tabular-nums">{value}</span>
    </div>
  );
}

const secPerBlock = (s: number) => `${(s / 60).toFixed(2)} min/block`;

export function Forecast() {
  const loader = Route.useLoaderData();
  const search = Route.useSearch();
  const navigate = useNavigate({ from: '/forecast' });
  const data = useArrivalData(loader.networkKey, loader.arrival);
  const now = useNow();
  const modelNow = useModelNow(now);
  const live = useModel(data, now);
  const model = useModel(data, modelNow);
  const tip = data.tip.height;

  const bondSchedule = useBondSchedule(loader.networkKey, tip);
  const bonds = React.useMemo(
    () => upcomingBonds(bondSchedule, tip),
    [bondSchedule, tip]
  );
  const milestones = React.useMemo(
    () => upcomingMilestones(tip, loader.pox, bonds),
    [tip, loader.pox, bonds]
  );
  const chips = React.useMemo(
    () => quickPicks(tip, loader.pox, bonds),
    [tip, loader.pox, bonds]
  );
  const defaultHeight =
    nextCycleStart(tip, loader.pox) ??
    (Math.floor(tip / RETARGET_INTERVAL) + 1) * RETARGET_INTERVAL;
  const target = search.height ?? defaultHeight;
  // Lives here, not in the result panel, so it survives changing the height
  // (including passing through mined heights while typing).
  const [deadlineInput, setDeadlineInput] = React.useState('');
  const [paceUntil, setPaceUntil] = React.useState(DEFAULT_PACE);
  const [paceAfter, setPaceAfter] = React.useState(DEFAULT_PACE);
  const blockTimes = useRecentBlockTimes(loader.networkKey, tip);
  const tipPoint = React.useMemo(
    () => ({ height: tip, time: data.tip.time }),
    [tip, data.tip.time]
  );
  const baselineControls: BaselineControls = {
    paceUntil,
    paceAfter,
    onPaceUntil: setPaceUntil,
    onPaceAfter: setPaceAfter,
    trailing: blockTimes.trailing
      ? paceStat(blockTimes.trailing, tipPoint)
      : null,
    epochAvg: blockTimes.epochStart
      ? paceStat(blockTimes.epochStart, tipPoint)
      : null,
  };

  const setHeight = React.useCallback(
    (height: number | undefined) => {
      navigate({
        search: (prev) => ({ ...prev, height }),
        replace: true,
      });
    },
    [navigate]
  );

  const mined = useMinedLookup(loader.networkKey, target, tip);
  const forecast = forecastFor(live.input, target, live.plan);
  const chartForecast = forecastFor(model.input, target, model.plan);

  return (
    <div className="flex flex-col gap-2">
      <section className="border border-border bg-card">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-3 py-2">
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <h1 className="font-mono text-sm font-medium">forecast</h1>
            <span className="font-mono text-[10px] text-muted-foreground">
              when will a bitcoin block arrive?
            </span>
          </div>
          <TipStatus
            tipHeight={tip}
            tipTime={data.tip.time}
            now={now}
            pace={live.plan.hashratePace.shrunkSecondsPerBlock}
            network={search.network}
          />
        </div>
        <HeightPicker
          target={target}
          explicit={search.height !== undefined}
          tip={tip}
          model={model}
          chips={chips}
          onChange={setHeight}
        />
      </section>

      <TargetResult
        target={target}
        tip={tip}
        now={now}
        forecast={forecast}
        chartForecast={chartForecast}
        mined={mined}
        pox={loader.pox}
        network={search.network}
        deadlineInput={deadlineInput}
        onDeadlineChange={setDeadlineInput}
        bonds={bondSchedule}
        baseline={baselineControls}
        onSelect={setHeight}
      />

      <MilestoneTable
        milestones={milestones}
        model={model}
        selected={target}
        onSelect={setHeight}
      />
    </div>
  );
}

function TargetResult({
  target,
  tip,
  now,
  forecast,
  chartForecast,
  mined,
  pox,
  network,
  deadlineInput,
  onDeadlineChange,
  bonds,
  baseline,
  onSelect,
}: {
  target: number;
  tip: number;
  now: number;
  forecast: ArrivalForecast | null;
  chartForecast: ArrivalForecast | null;
  mined: MinedLookup | null;
  pox: PoxParams | null;
  network?: string;
  deadlineInput: string;
  onDeadlineChange: (value: string) => void;
  bonds: readonly Bond[];
  baseline: BaselineControls;
  onSelect: (height: number) => void;
}) {
  const schedule = (
    <ScheduleStatus
      height={target}
      tip={tip}
      pox={pox}
      bonds={bonds}
      onSelect={onSelect}
    />
  );
  if (target <= tip) {
    return (
      <MinedResult
        target={target}
        tip={tip}
        now={now}
        lookup={mined}
        network={network}
        schedule={schedule}
      />
    );
  }
  if (!(forecast && chartForecast)) {
    return <BeyondHorizon target={target} tip={tip} now={now} />;
  }
  return (
    <ForecastResult
      forecast={forecast}
      chartForecast={chartForecast}
      now={now}
      deadlineInput={deadlineInput}
      onDeadlineChange={onDeadlineChange}
      schedule={schedule}
      baselineControls={baseline}
    />
  );
}

function TipStatus({
  tipHeight,
  tipTime,
  now,
  pace,
  network,
}: {
  tipHeight: number;
  tipTime: number;
  now: number;
  pace: number;
  network?: string;
}) {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-[10px] text-muted-foreground tabular-nums">
      <span>
        tip{' '}
        <Link
          to="/btc-blocks/$heightOrHash"
          params={{ heightOrHash: String(tipHeight) }}
          search={{ network }}
          className="text-foreground hover:underline"
        >
          {tipHeight.toLocaleString()}
        </Link>{' '}
        · {formatRelative(tipTime, now)}
      </span>
      <span title="hashrate-based pace for the rest of this difficulty epoch">
        pace {secPerBlock(pace)}
      </span>
    </div>
  );
}

function HeightPicker({
  target,
  explicit,
  tip,
  model,
  chips,
  onChange,
}: {
  target: number;
  explicit: boolean;
  tip: number;
  model: ModelState;
  chips: Chip[];
  onChange: (height: number | undefined) => void;
}) {
  const [value, setValue] = React.useState(explicit ? String(target) : '');
  const [date, setDate] = React.useState('');
  const debounce = React.useRef<number>();
  React.useEffect(() => () => window.clearTimeout(debounce.current), []);
  // Follow height changes made elsewhere (chips, table rows, the URL).
  React.useEffect(() => {
    setValue((current) => {
      const typed = Number(current.replaceAll(',', '').trim());
      if (!explicit) return current.trim() === '' ? current : '';
      return typed === target ? current : String(target);
    });
  }, [target, explicit]);

  const onInput = (next: string) => {
    setValue(next);
    window.clearTimeout(debounce.current);
    const trimmed = next.replaceAll(',', '').trim();
    if (trimmed === '') {
      debounce.current = window.setTimeout(
        () => onChange(undefined),
        INPUT_DEBOUNCE_MS
      );
      return;
    }
    const height = Number(trimmed);
    if (!(Number.isSafeInteger(height) && height >= 0)) return;
    debounce.current = window.setTimeout(
      () => onChange(height),
      INPUT_DEBOUNCE_MS
    );
  };

  const dateTime = fromDateTimeLocal(date);
  const atDate =
    dateTime === null ? null : heightAtTime(model.input, model.plan, dateTime);

  return (
    <div className="grid grid-cols-1 gap-3 px-3 py-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <div className="flex flex-col gap-1.5">
        <label htmlFor="forecast-height">
          <PanelLabel>bitcoin block height</PanelLabel>
        </label>
        <input
          id="forecast-height"
          inputMode="numeric"
          autoComplete="off"
          placeholder={target.toLocaleString()}
          value={value}
          onChange={(e) => onInput(e.target.value)}
          className="h-9 w-full border border-input bg-transparent px-3 font-mono text-sm tabular-nums placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        />
        <div className="flex flex-wrap gap-1">
          {chips.map((chip) => (
            <button
              key={chip.label}
              type="button"
              onClick={() => onChange(chip.height)}
              className={cn(
                'border border-border px-2 py-0.5 font-mono text-[10px] transition-colors hover:bg-muted/30 hover:text-foreground',
                chip.height === target
                  ? 'bg-muted/40 text-foreground'
                  : 'text-muted-foreground'
              )}
            >
              {chip.label}
            </button>
          ))}
        </div>
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="forecast-date">
          <PanelLabel>or find the block at a date</PanelLabel>
        </label>
        <DateTimeField
          id="forecast-date"
          value={date}
          min={toDateTimeLocal(model.input.now)}
          onChange={setDate}
        />
        <div className="min-h-5 font-mono text-[10px] text-muted-foreground">
          {atDate === null ? (
            dateHint(dateTime, model.input.now)
          ) : (
            <span>
              ≈ block{' '}
              <button
                type="button"
                className="text-primary hover:underline"
                onClick={() => onChange(atDate)}
              >
                {atDate.toLocaleString()}
              </button>{' '}
              · {(atDate - tip).toLocaleString()} blocks ahead
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

function dateHint(dateTime: number | null, now: number) {
  if (dateTime === null) {
    return 'the height whose median arrival is closest after that time';
  }
  if (dateTime <= now) return 'pick a time in the future';
  return `beyond the model's ${MAX_HORIZON_BLOCKS.toLocaleString()}-block horizon`;
}

function minedTimeText(lookup: MinedLookup | null, now: number) {
  if (lookup?.status === 'loading') return 'looking up its time…';
  if (lookup?.status === 'too-old') {
    return 'older than the forecast window; see the block page for its time';
  }
  const time = lookup?.status === 'done' ? lookup.arrival?.time : null;
  if (time === null || time === undefined) return 'its time is not known';
  return `${formatDateTime(time)} · ${formatRelative(time, now)}`;
}

function EpochTag({ height }: { height: number }) {
  const epoch = Math.floor(height / RETARGET_INTERVAL);
  const epochIndex = height % RETARGET_INTERVAL;
  return (
    <span className="inline-block border border-border px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
      difficulty epoch {epoch} ·{' '}
      {epochIndex === 0
        ? 'retarget block'
        : `${(epochIndex + 1).toLocaleString()}/${RETARGET_INTERVAL.toLocaleString()}`}
    </span>
  );
}

function ForecastResult({
  forecast,
  chartForecast,
  now,
  deadlineInput,
  onDeadlineChange,
  schedule,
  baselineControls,
}: {
  forecast: ArrivalForecast;
  chartForecast: ArrivalForecast;
  now: number;
  deadlineInput: string;
  onDeadlineChange: (value: string) => void;
  schedule: React.ReactNode;
  baselineControls: BaselineControls;
}) {
  const paceUntil = parsePace(baselineControls.paceUntil);
  const paceAfter = parsePace(baselineControls.paceAfter);
  const paces = paceUntil !== null && paceAfter !== null;
  const baseline = paces
    ? baselineForecast(forecast, paceUntil, paceAfter)
    : null;
  const chartBaseline = paces
    ? baselineForecast(chartForecast, paceUntil, paceAfter).median
    : null;
  const deadline = fromDateTimeLocal(deadlineInput);
  const dist = React.useMemo(
    () => ArrivalDistribution.fromParams(chartForecast.distribution),
    [chartForecast.distribution]
  );
  const deadlineP = deadline === null ? null : dist.cdf(deadline);
  const n = forecast.blocksRemaining;

  return (
    <section className="border border-border bg-card">
      <div className="grid grid-cols-1 border-b border-border md:grid-cols-3">
        <div className="border-b border-border px-3 py-3 md:border-r md:border-b-0">
          <PanelLabel>block</PanelLabel>
          <div className="mt-1 font-mono text-2xl font-semibold leading-none tabular-nums">
            {forecast.targetHeight.toLocaleString()}
          </div>
          <div className="mt-1.5 mb-2 font-mono text-[10px] text-muted-foreground">
            {n.toLocaleString()} block{n === 1 ? '' : 's'} ahead of the tip
          </div>
          <EpochTag height={forecast.targetHeight} />
        </div>
        <div className="border-b border-border px-3 py-3 md:border-r md:border-b-0">
          <PanelLabel>most likely (median)</PanelLabel>
          <div className="mt-1 font-mono text-2xl font-semibold leading-none tabular-nums">
            {formatCountdown(forecast.median - now)}
          </div>
          <div className="mt-1.5 font-mono text-xs">
            {formatDate(forecast.median)}
          </div>
          <div className="font-mono text-[10px] text-muted-foreground">
            {formatTime(forecast.median)}
          </div>
        </div>
        <div className="px-3 py-3">
          <PanelLabel>likely range</PanelLabel>
          <div className="mt-1 space-y-1 font-mono text-xs tabular-nums">
            <div>
              <span className="mr-2 text-muted-foreground">80%</span>
              {formatDateTime(forecast.q10)} – {formatDateTime(forecast.q90)}
            </div>
            <div>
              <span className="mr-2 text-muted-foreground">95%</span>
              {formatDateTime(forecast.q025)} – {formatDateTime(forecast.q975)}
            </div>
          </div>
          <div className="mt-1.5 font-mono text-[10px] text-muted-foreground">
            {formatDuration(forecast.median - now)} (
            {formatDuration(forecast.q10 - now)} to{' '}
            {formatDuration(forecast.q90 - now)}) from now
          </div>
        </div>
      </div>

      <div className="border-b border-border">{schedule}</div>
      <div className="grid grid-cols-[minmax(0,1fr)] md:grid-cols-[minmax(0,2fr)_minmax(16rem,1fr)]">
        <div className="min-w-0 border-b border-border px-3 py-2.5 md:border-r md:border-b-0">
          <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
            <PanelLabel>arrival probability</PanelLabel>
            <span className="flex items-center gap-3 font-mono text-[10px] text-muted-foreground">
              <span className="flex items-center gap-1">
                <i className="h-1.5 w-3 bg-amber-500/60" /> density
              </span>
              <span className="flex items-center gap-1">
                <i className="w-3 border-t border-dashed border-foreground" />{' '}
                arrived by
              </span>
              <span className="flex items-center gap-1">
                <i className="h-2.5 w-0.5 bg-sky-500" /> 10 minute block time
                baseline
              </span>
            </span>
          </div>
          <ArrivalChart
            forecast={chartForecast}
            now={now}
            deadline={deadline}
            baselineMedian={chartBaseline}
          />
        </div>
        <div className="min-w-0 px-3 py-2.5">
          <PanelLabel>chance it has arrived by</PanelLabel>
          <div className="mt-1">
            {LADDER.map((p) => {
              const t = dist.quantile(p);
              return (
                <DataRow
                  key={p}
                  label={`${Math.round(p * 100)}%`}
                  value={
                    <>
                      {formatDateTime(t)}
                      <span className="ml-2 text-muted-foreground">
                        {formatRelative(t, now)}
                      </span>
                    </>
                  }
                />
              );
            })}
          </div>
          <div className="mt-3 flex flex-col gap-1.5">
            <label htmlFor="forecast-deadline">
              <PanelLabel>chance by a deadline</PanelLabel>
            </label>
            <DateTimeField
              id="forecast-deadline"
              size="sm"
              value={deadlineInput}
              onChange={onDeadlineChange}
            />
            {deadlineP !== null ? (
              <div className="font-mono text-xs">
                <span className="text-lg font-semibold tabular-nums">
                  {formatProbability(deadlineP)}
                </span>{' '}
                <span className="text-muted-foreground">
                  chance block {forecast.targetHeight.toLocaleString()} is mined
                  by then
                </span>
              </div>
            ) : null}
          </div>
        </div>
      </div>
      <ModelDetails forecast={forecast} now={now} />
      <div className="border-t border-border">
        <BaselineRow
          forecast={forecast}
          baseline={baseline}
          controls={baselineControls}
        />
      </div>
    </section>
  );
}

function ModelDetails({
  forecast,
  now,
}: {
  forecast: ArrivalForecast;
  now: number;
}) {
  const { components: c, quality: q } = forecast;
  const segments = [
    { label: 'rest of this epoch', seg: c.currentEpoch },
    { label: 'next epoch', seg: c.nextEpoch },
    { label: 'later epochs', seg: c.beyond },
  ].filter((s) => s.seg.blocks > 0);
  const change = c.retarget.projectedDifficultyChangePct;
  return (
    <details className="border-t border-border">
      <summary className="cursor-pointer px-3 py-2.5 hover:bg-muted/30">
        <PanelLabel>how this is estimated</PanelLabel>
      </summary>
      <div className="grid grid-cols-1 gap-x-6 px-3 pb-3 md:grid-cols-3">
        <div>
          <div className="mb-1 mt-1">
            <PanelLabel>pace to target</PanelLabel>
          </div>
          {segments.map(({ label, seg }) => (
            <DataRow
              key={label}
              label={`${label} · ${seg.blocks.toLocaleString()} blk`}
              value={secPerBlock(seg.secondsPerBlock)}
            />
          ))}
          <DataRow
            label="mean time to target"
            value={formatDuration(forecast.mean - now)}
          />
        </div>
        <div>
          <div className="mb-1 mt-1">
            <PanelLabel>next difficulty adjustment</PanelLabel>
          </div>
          <DataRow label="height" value={c.retarget.height.toLocaleString()} />
          <DataRow
            label="expected (mean path)"
            value={formatDateTime(c.retarget.projectedTime)}
          />
          <DataRow
            label="projected change"
            value={`${change >= 0 ? '+' : ''}${change.toFixed(2)}%`}
            title="positive = harder (blocks were faster than 10 min)"
          />
          <DataRow
            label="epoch duration"
            value={`${formatDuration(c.retarget.projectedEpochSeconds)} (target 14d)`}
          />
        </div>
        <div>
          <div className="mb-1 mt-1">
            <PanelLabel>hashrate measurement</PanelLabel>
          </div>
          <DataRow
            label="measured pace"
            value={
              c.hashratePace.measuredSecondsPerBlock === null
                ? 'no history'
                : secPerBlock(c.hashratePace.measuredSecondsPerBlock)
            }
            title="difficulty-normalised, exponentially weighted (half-life 700 blocks)"
          />
          <DataRow
            label="weight on data"
            value={`${Math.round(c.hashratePace.dataWeight * 100)}%`}
            title={`the rest is a ${c.hashratePace.priorBlocks}-block prior at 10 min/block`}
          />
          <DataRow
            label="samples"
            value={`${q.sampleHeightsAvailable}/${q.sampleHeightsRequested} heights`}
          />
          {q.flatFallback ? (
            <DataRow label="fallback" value="flat 10 min/block" />
          ) : null}
        </div>
      </div>
      <p className="px-3 pb-3 font-sans text-xs text-muted-foreground">
        The current epoch runs at the hashrate pace measured from recent blocks
        (shrunk toward 10 min/block); the next epoch uses the pace implied by
        the projected retarget, and everything after that is 10 min/block. The
        shown time is the median of a Gamma waiting-time model with rate
        uncertainty, counted from now, so it keeps moving while no block
        arrives. The 80% and 95% ranges were calibrated on past blocks up to
        about a week ahead; beyond two weeks they are conservative. Model{' '}
        <span className="font-mono">{forecast.modelVersion}</span>.
      </p>
    </details>
  );
}

function BeyondHorizon({
  target,
  tip,
  now,
}: {
  target: number;
  tip: number;
  now: number;
}) {
  const n = target - tip;
  const rough = now + n * 600;
  return (
    <section className="border border-border bg-card px-3 py-3">
      <PanelLabel>block {target.toLocaleString()}</PanelLabel>
      <div className="mt-1 font-mono text-sm">
        {n.toLocaleString()} blocks ahead is beyond the model's{' '}
        {MAX_HORIZON_BLOCKS.toLocaleString()}-block horizon.
      </div>
      <div className="mt-1 font-mono text-xs text-muted-foreground">
        at a flat 10 min/block it would land around {formatDate(rough)} (
        {formatRelative(rough, now)}), with no meaningful confidence range.
      </div>
    </section>
  );
}

function MinedResult({
  target,
  tip,
  now,
  lookup,
  network,
  schedule,
}: {
  target: number;
  tip: number;
  now: number;
  lookup: MinedLookup | null;
  schedule: React.ReactNode;
  network?: string;
}) {
  const behind = tip - target;
  return (
    <section className="border border-border bg-card px-3 py-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <PanelLabel>block</PanelLabel>
          <div className="mt-1 font-mono text-2xl font-semibold leading-none tabular-nums">
            {target.toLocaleString()}
          </div>
        </div>
        <Link
          to="/btc-blocks/$heightOrHash"
          params={{ heightOrHash: String(target) }}
          search={{ network }}
          className="font-mono text-xs text-primary hover:underline"
        >
          → view block
        </Link>
      </div>
      <div className="mt-2 font-mono text-xs">
        <span className="text-green-600 dark:text-green-500">●</span> mined
        {behind === 0
          ? ' · current tip'
          : ` · ${behind.toLocaleString()} blocks ago`}
      </div>
      <div className="mt-1 font-mono text-xs text-muted-foreground">
        {minedTimeText(lookup, now)}
      </div>
      <div className="mt-2">
        <EpochTag height={target} />
      </div>
      <div className="-mx-3 -mb-3 mt-3 border-t border-border">{schedule}</div>
    </section>
  );
}

function MilestoneTable({
  milestones,
  model,
  selected,
  onSelect,
}: {
  milestones: Milestone[];
  model: ModelState;
  selected: number;
  onSelect: (height: number) => void;
}) {
  const { input, plan } = model;
  const [filter, setFilter] = React.useState<TableFilter>('all');
  const rows =
    filter === 'all'
      ? milestones
      : milestones.filter((m) => m.kinds.includes(filter));
  return (
    <section className="border border-border bg-card">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-3 py-2">
        <PanelLabel>upcoming</PanelLabel>
        <div className="flex">
          {TABLE_FILTERS.map((key) => (
            <button
              key={key}
              type="button"
              onClick={() => setFilter(key)}
              className={cn(
                'border border-border px-2 py-0.5 font-mono text-[10px] uppercase transition-colors hover:bg-muted/30 hover:text-foreground [&+&]:border-l-0',
                key === filter
                  ? 'bg-muted/40 text-foreground'
                  : 'text-muted-foreground'
              )}
            >
              {FILTER_LABELS[key]}
            </button>
          ))}
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full font-mono text-xs tabular-nums">
          <thead>
            <tr className="border-b border-border text-left text-[10px] uppercase tracking-wider text-muted-foreground">
              <th className="px-3 py-1.5 font-normal">event</th>
              <th className="px-3 py-1.5 text-right font-normal">height</th>
              <th className="px-3 py-1.5 text-right font-normal">blocks</th>
              <th className="px-3 py-1.5 font-normal">median</th>
              <th className="hidden px-3 py-1.5 font-normal md:table-cell">
                80% range
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((m) => {
              const f = forecastFor(input, m.height, plan);
              const n = m.height - input.tipHeight;
              const rough = input.now + n * 600;
              return (
                <tr
                  key={m.key}
                  onClick={() => onSelect(m.height)}
                  className={cn(
                    'cursor-pointer border-b border-border/50 last:border-b-0 hover:bg-muted/30',
                    m.height === selected && 'bg-muted/40'
                  )}
                >
                  <td className="px-3 py-1.5">
                    <div>{m.label}</div>
                    <div className="text-[10px] text-muted-foreground">
                      {m.detail}
                    </div>
                  </td>
                  <td className="px-3 py-1.5 text-right">
                    {m.height.toLocaleString()}
                  </td>
                  <td className="px-3 py-1.5 text-right text-muted-foreground">
                    {n.toLocaleString()}
                  </td>
                  <td className="px-3 py-1.5">
                    {f ? (
                      <>
                        <div>{formatDateTime(f.median)}</div>
                        <div className="text-[10px] text-muted-foreground">
                          {formatRelative(f.median, input.now)}
                        </div>
                      </>
                    ) : (
                      <>
                        <div className="text-muted-foreground">
                          ~{formatDate(rough)}
                        </div>
                        <div className="text-[10px] text-muted-foreground">
                          beyond horizon · at 10 min/block
                        </div>
                      </>
                    )}
                  </td>
                  <td className="hidden px-3 py-1.5 text-muted-foreground md:table-cell">
                    {f
                      ? `${formatDateTime(f.q10)} – ${formatDateTime(f.q90)}`
                      : '–'}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
