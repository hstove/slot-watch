import React from 'react';
import { atom, useAtomValue, useSetAtom } from 'jotai';
import { Link } from '@tanstack/react-router';
import {
  activeBlockHashAtom,
  loadMoreBurnBlocksAtom,
  maxProcessedStacksHeightAtom,
  responseOutcomeForBlockAtomFamily,
  setAllBurnBlocksAtom,
  sortedBurnBlocksAtom,
  stacksBlocksForBurnBlockAtom,
} from '@/store/blocks-store';
import {
  miniResponsesAtomFamilyWithLoader,
  miniResponsesForBlockFamily,
  preCommitsAtomFamilyWithLoader,
  preCommitsForBlockFamily,
} from '@/store/responses-store';
import { setSignersApiAtom, signersApiAtom } from '@/store/signers-store';
import type { ApiBlockForBurnBlock } from '@/lib/slots-api';
import { type ApiBurnBlock, satsToBtc } from 'slot-watch-common';
import { TenureChangeCause } from '@stacks/transactions';
import { Route } from '@/routes/index';
import { BlockModal } from '@/components/block/block-modal';
import { BtcIcon } from '@/components/icons/btc-icon';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import {
  ActivityIcon,
  CheckIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  RadioIcon,
  XIcon,
} from 'lucide-react';

const timelineDataAtom = atom(async (get) => {
  const burnBlocks = get(sortedBurnBlocksAtom);
  const stacksByTenure = await Promise.all(
    burnBlocks.map((block) =>
      get(stacksBlocksForBurnBlockAtom(block.consensusHash))
    )
  );
  const uniqueBlocks = new Map<string, ApiBlockForBurnBlock>();
  for (const block of stacksByTenure.flat()) {
    uniqueBlocks.set(block.blockHash, block);
  }
  return { burnBlocks, stacksBlocks: [...uniqueBlocks.values()] };
});

type TimelineEvent =
  | { kind: 'bitcoin'; timestamp: number; block: ApiBurnBlock }
  | { kind: 'stacks'; timestamp: number; block: ApiBlockForBurnBlock };

type StacksStatus = 'confirmed' | 'pending' | 'rejected';

type TimelineSegment =
  | Extract<TimelineEvent, { kind: 'bitcoin' }>
  | Extract<TimelineEvent, { kind: 'stacks' }>
  | { kind: 'bundle'; blocks: ApiBlockForBurnBlock[] };

function timestampForBlock(block: ApiBlockForBurnBlock) {
  return new Date(block.proposedAt ?? block.blockTimestamp).getTime();
}

function statusForBlock(
  block: ApiBlockForBurnBlock,
  maxProcessedHeight: number
): StacksStatus {
  if (block.processedAt) return 'confirmed';
  if (block.blockHeight <= maxProcessedHeight) return 'rejected';
  return 'pending';
}

function isTenureExtend(cause: number | null) {
  return cause !== null && cause !== TenureChangeCause.BlockFound;
}

function tenureColor(burnBlockHeight: number) {
  // Golden-angle spacing so consecutive Bitcoin tenures land ~137° apart
  // on the hue wheel instead of clustering from a hash collision.
  const hue = (burnBlockHeight * 137.508) % 360;
  return `hsl(${hue} 72% 58%)`;
}

function formatClock(timestamp: number) {
  return new Date(timestamp).toLocaleTimeString('en-US', {
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

function formatDuration(ms: number) {
  const seconds = Math.max(0, Math.floor(ms / 1000));
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  if (minutes < 60) {
    return remainingSeconds === 0
      ? `${minutes}m`
      : `${minutes}m ${remainingSeconds}s`;
  }
  const hours = Math.floor(minutes / 60);
  return `${hours}h ${minutes % 60}m`;
}

function median(values: number[]) {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return ((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2;
  }
  return sorted[middle] ?? 0;
}

function getCadence(blocks: ApiBlockForBurnBlock[]) {
  const confirmed = blocks
    .filter((block) => block.processedAt)
    .sort((a, b) => timestampForBlock(b) - timestampForBlock(a))
    .slice(0, 31);
  const intervals = confirmed.slice(0, -1).map((block, index) => {
    const next = confirmed[index + 1];
    return next ? timestampForBlock(block) - timestampForBlock(next) : 0;
  });
  return median(intervals.filter((interval) => interval > 0));
}

function makeEvents(
  burnBlocks: ApiBurnBlock[],
  stacksBlocks: ApiBlockForBurnBlock[]
) {
  const allEvents: TimelineEvent[] = [
    ...burnBlocks.map(
      (block): TimelineEvent => ({
        kind: 'bitcoin',
        block,
        timestamp: new Date(block.createdAt).getTime(),
      })
    ),
    ...stacksBlocks.map(
      (block): TimelineEvent => ({
        kind: 'stacks',
        block,
        timestamp: timestampForBlock(block),
      })
    ),
  ].sort((a, b) => b.timestamp - a.timestamp);

  return allEvents;
}

function makeSegments(events: TimelineEvent[]) {
  const segments: TimelineSegment[] = [];
  let keptLatestStacksBlock = false;

  for (const event of events) {
    if (event.kind === 'bitcoin') {
      segments.push(event);
      continue;
    }
    if (!keptLatestStacksBlock) {
      keptLatestStacksBlock = true;
      segments.push(event);
      continue;
    }

    const previous = segments.at(-1);
    if (
      previous?.kind === 'bundle' &&
      previous.blocks[0]?.consensusHash === event.block.consensusHash
    ) {
      previous.blocks.push(event.block);
    } else {
      segments.push({ kind: 'bundle', blocks: [event.block] });
    }
  }
  return segments;
}

function timestampForSegment(segment?: TimelineSegment) {
  if (!segment) return undefined;
  if (segment.kind !== 'bundle') return segment.timestamp;
  const firstBlock = segment.blocks[0];
  return firstBlock ? timestampForBlock(firstBlock) : undefined;
}

function HealthMetrics({
  blocks,
  burnBlocks,
  now,
}: {
  blocks: ApiBlockForBurnBlock[];
  burnBlocks: ApiBurnBlock[];
  now: number;
}) {
  const latestConfirmed = [...blocks]
    .filter((block) => block.processedAt)
    .sort(
      (a, b) =>
        new Date(b.processedAt ?? 0).getTime() -
        new Date(a.processedAt ?? 0).getTime()
    )[0];
  const latestBurnBlock = burnBlocks[0];
  const cadence = getCadence(blocks);
  const currentTenureCount = latestBurnBlock
    ? blocks.filter(
        (block) => block.consensusHash === latestBurnBlock.consensusHash
      ).length
    : 0;

  return (
    <section className="border border-border bg-card">
      <div className="grid grid-cols-2 divide-x divide-y divide-border md:grid-cols-4 md:divide-y-0">
        <PulseMetric
          label="last stacks block"
          value={
            latestConfirmed?.processedAt
              ? `${formatDuration(now - new Date(latestConfirmed.processedAt).getTime())} ago`
              : 'unknown'
          }
          detail={
            latestConfirmed
              ? `block ${latestConfirmed.blockHeight.toLocaleString()}`
              : 'no recent block'
          }
        />
        <PulseMetric
          label="last bitcoin block"
          value={
            latestBurnBlock
              ? `${formatDuration(now - new Date(latestBurnBlock.createdAt).getTime())} ago`
              : 'unknown'
          }
          detail={
            latestBurnBlock
              ? `block ${latestBurnBlock.burnBlockHeight.toLocaleString()}`
              : 'no recent block'
          }
        />
        <PulseMetric
          label="stacks cadence"
          value={cadence ? `${(cadence / 1000).toFixed(1)}s` : 'unknown'}
          detail="median · last 30"
        />
        <PulseMetric
          label="current tenure"
          value={
            latestBurnBlock
              ? `#${latestBurnBlock.burnBlockHeight.toLocaleString()}`
              : 'unknown'
          }
          detail={`${currentTenureCount.toLocaleString()} blocks observed`}
        />
      </div>
    </section>
  );
}

function PulseMetric({
  label,
  value,
  detail,
}: {
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <div className="min-w-0 px-4 py-3">
      <div className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
        {label}
      </div>
      <div className="mt-1 truncate font-mono text-base font-medium">
        {value}
      </div>
      <div className="truncate font-mono text-[10px] text-muted-foreground">
        {detail}
      </div>
    </div>
  );
}

function BitcoinEvent({
  event,
  allBlocks,
}: {
  event: Extract<TimelineEvent, { kind: 'bitcoin' }>;
  allBlocks: ApiBlockForBurnBlock[];
}) {
  const color = tenureColor(event.block.burnBlockHeight);
  const matchingBlocks = allBlocks
    .filter(
      (block) =>
        block.consensusHash === event.block.consensusHash &&
        timestampForBlock(block) >= event.timestamp
    )
    .sort((a, b) => timestampForBlock(a) - timestampForBlock(b));
  const tenureDelay = matchingBlocks[0]
    ? timestampForBlock(matchingBlocks[0]) - event.timestamp
    : null;
  let tenureLabel = `${matchingBlocks.length.toLocaleString()} matching blocks in view`;
  if (tenureDelay === null) {
    tenureLabel = 'no matching miner commit yet · prior tenure continues';
  } else if (tenureDelay > 15_000) {
    tenureLabel = `tenure began ${formatDuration(tenureDelay)} later`;
  }
  const minerSpendBtc = satsToBtc(event.block.poxSpendSats).toFormat();

  return (
    <div className="relative py-2 md:py-3">
      <div
        className="absolute bottom-0 left-[74px] top-0 w-px md:left-[106px]"
        style={{ backgroundColor: color }}
      />
      <Link
        to="/btc-blocks/$heightOrHash"
        params={{ heightOrHash: event.block.burnBlockHeight.toString() }}
        className="relative grid grid-cols-[62px_1fr] items-stretch gap-3 border border-border bg-card transition-colors hover:bg-muted/40 md:grid-cols-[94px_1fr]"
        style={{ borderLeftColor: color, borderLeftWidth: 3 }}
        title={`Bitcoin block ${event.block.burnBlockHeight} · ${minerSpendBtc} BTC miner spend · ${new Date(event.block.createdAt).toLocaleString()}`}
      >
        <div className="flex items-center justify-end border-r border-border px-2 py-3 font-mono text-[10px] text-muted-foreground md:text-xs">
          {formatClock(event.timestamp)}
        </div>
        <div className="flex min-w-0 flex-col gap-1 px-1 py-3 md:flex-row md:items-center md:justify-between md:gap-4 md:px-3">
          <div className="flex min-w-0 items-center gap-2">
            <BtcIcon className="h-4 w-4 shrink-0" />
            <span className="font-mono text-sm font-medium">
              bitcoin #{event.block.burnBlockHeight.toLocaleString()}
            </span>
            <span
              className="h-2.5 w-2.5 shrink-0"
              style={{ backgroundColor: color }}
              title="tenure color"
            />
          </div>
          <div className="flex min-w-0 flex-col gap-0.5 font-mono text-[10px] md:items-end md:text-right">
            <span className="text-foreground md:text-xs">
              {minerSpendBtc} BTC
            </span>
            <span className="text-muted-foreground">{tenureLabel}</span>
          </div>
        </div>
      </Link>
    </div>
  );
}

function StacksEvent({
  event,
  status,
}: {
  event: Extract<TimelineEvent, { kind: 'stacks' }>;
  status: StacksStatus;
}) {
  const setActiveBlockHash = useSetAtom(activeBlockHashAtom);
  const color = tenureColor(event.block.burnBlockHeight);

  return (
    <div className="relative grid grid-cols-[62px_1fr] gap-3 md:grid-cols-[94px_1fr]">
      <div className="flex items-center justify-end py-2 font-mono text-[10px] text-muted-foreground md:text-xs">
        {formatClock(event.timestamp)}
      </div>
      <div
        className="absolute bottom-0 left-[74px] top-0 w-px md:left-[106px]"
        style={{ backgroundColor: color }}
      />
      <div className="relative py-1.5">
        <button
          type="button"
          onClick={() => setActiveBlockHash(event.block.blockHash)}
          className="flex min-h-[76px] w-full min-w-0 items-center gap-3 border border-border bg-card px-3 py-3 text-left font-mono transition-colors hover:bg-muted/40"
          style={{ borderLeftColor: color, borderLeftWidth: 3 }}
          title={`Stacks block ${event.block.blockHeight} · ${status} · ${new Date(event.timestamp).toLocaleString()} · click for details`}
        >
          <StatusIcon status={status} />
          <div className="min-w-0 flex-1">
            <span className="truncate text-xs font-medium md:text-sm">
              block {event.block.blockHeight.toLocaleString()}
            </span>
            {status === 'pending' ? (
              <React.Suspense
                fallback={
                  <div className="mt-2 h-1.5 w-full animate-pulse bg-muted" />
                }
              >
                <LiveResponses blockHash={event.block.blockHash} />
              </React.Suspense>
            ) : (
              <LatestSettledStatus block={event.block} status={status} />
            )}
          </div>
        </button>
      </div>
    </div>
  );
}

function LatestSettledStatus({
  block,
  status,
}: {
  block: ApiBlockForBurnBlock;
  status: Exclude<StacksStatus, 'pending'>;
}) {
  const confirmationTime =
    block.processedAt && block.proposedAt
      ? new Date(block.processedAt).getTime() -
        new Date(block.proposedAt).getTime()
      : null;
  const isConfirmed = status === 'confirmed';

  return (
    <div className="mt-2">
      <div
        className={cn(
          'mb-1.5 flex items-center gap-1 text-[10px]',
          isConfirmed
            ? 'text-green-600 dark:text-green-400'
            : 'text-destructive'
        )}
      >
        {isConfirmed ? (
          <CheckIcon className="h-3 w-3" />
        ) : (
          <XIcon className="h-3 w-3" />
        )}
        {isConfirmed ? 'confirmed' : 'rejected'}
        {confirmationTime !== null && ` · ${formatDuration(confirmationTime)}`}
      </div>
      <div className="h-1.5 w-full bg-muted">
        <div
          className={cn(
            'h-full w-full',
            isConfirmed ? 'bg-green-500' : 'bg-destructive'
          )}
        />
      </div>
    </div>
  );
}

function LiveResponses({ blockHash }: { blockHash: string }) {
  useAtomValue(miniResponsesAtomFamilyWithLoader(blockHash));
  useAtomValue(preCommitsAtomFamilyWithLoader(blockHash));
  const responses = useAtomValue(miniResponsesForBlockFamily(blockHash));
  const preCommits = useAtomValue(preCommitsForBlockFamily(blockHash));
  const signers = useAtomValue(signersApiAtom);
  const outcome = useAtomValue(responseOutcomeForBlockAtomFamily(blockHash));
  const responseSignerKeys = new Set(
    responses.map((response) => response.signerPublicKey)
  );
  const preCommitSignerKeys = new Set(
    preCommits.map((preCommit) => preCommit.signerPublicKey)
  );
  const signerWeights = new Map(
    signers?.signers.map((signer) => [signer.publicKey, signer.weight]) ?? []
  );
  const preCommitWeight = [...preCommitSignerKeys].reduce(
    (total, publicKey) => total + (signerWeights.get(publicKey) ?? 0),
    0
  );
  const preCommitOnlyWeight = [...preCommitSignerKeys].reduce(
    (total, publicKey) =>
      total +
      (responseSignerKeys.has(publicKey)
        ? 0
        : (signerWeights.get(publicKey) ?? 0)),
    0
  );
  const totalWeight = signers?.totalWeight ?? 1;
  const preCommitPercent = (preCommitWeight / totalWeight) * 100;
  const preCommitOnlyPercent = (preCommitOnlyWeight / totalWeight) * 100;
  const uniqueResponses = responseSignerKeys.size;
  const uniquePreCommits = preCommitSignerKeys.size;
  const accept = Number(outcome?.acceptPercentString ?? 0);
  const reject = Number(outcome?.rejectPercentString ?? 0);
  let statusClass = 'text-muted-foreground';
  let statusLabel = 'proposed · waiting for pre-commits';
  if (uniquePreCommits > 0) {
    statusClass = 'text-cyan-600 dark:text-cyan-400';
    statusLabel = `${uniquePreCommits} pre-commits arriving`;
  }
  if (uniqueResponses > 0) {
    statusClass = 'text-muted-foreground';
    statusLabel = `${uniqueResponses} signer responses`;
  }
  if (outcome?.accepted === true) {
    statusClass = 'text-green-600 dark:text-green-400';
    statusLabel = 'accepted · awaiting confirmation';
  } else if (outcome?.accepted === false) {
    statusClass = 'text-destructive';
    statusLabel = 'rejected';
  }

  return (
    <div className="mt-2">
      <div className="mb-1.5 flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-[10px]">
        <span className={cn('flex items-center gap-1', statusClass)}>
          <ActivityIcon className="h-3 w-3" />
          {statusLabel}
        </span>
        <span className="flex shrink-0 gap-2 text-muted-foreground">
          <span className="text-cyan-600 dark:text-cyan-400">
            {preCommitPercent.toFixed(1)}% pc
          </span>
          <span className="text-green-600 dark:text-green-400">
            {outcome?.acceptPercentString ?? '0'}% yes
          </span>
          <span className="text-destructive">
            {outcome?.rejectPercentString ?? '0'}% no
          </span>
        </span>
      </div>
      <div className="flex h-1.5 w-full overflow-hidden bg-muted">
        <div
          className="bg-green-500 transition-all"
          style={{ width: `${accept}%` }}
        />
        <div
          className="bg-destructive transition-all"
          style={{ width: `${reject}%` }}
        />
        <div
          className="bg-cyan-500 transition-all"
          style={{ width: `${preCommitOnlyPercent}%` }}
        />
      </div>
    </div>
  );
}

function StatusIcon({ status }: { status: StacksStatus }) {
  if (status === 'confirmed') {
    return (
      <span className="flex h-5 w-5 shrink-0 items-center justify-center border border-green-500/50 text-green-600 dark:text-green-400">
        <CheckIcon className="h-3 w-3" />
      </span>
    );
  }
  if (status === 'rejected') {
    return (
      <span className="flex h-5 w-5 shrink-0 items-center justify-center border border-destructive/60 text-destructive">
        <XIcon className="h-3 w-3" />
      </span>
    );
  }
  return (
    <span className="relative flex h-5 w-5 shrink-0 items-center justify-center border border-blue-500/60 text-blue-500">
      <span className="absolute h-2 w-2 animate-ping bg-blue-500/40" />
      <span className="h-1.5 w-1.5 bg-blue-500" />
    </span>
  );
}

function SettledBundle({
  blocks,
  nextTimestamp,
  burnBlocks,
  maxProcessedHeight,
}: {
  blocks: ApiBlockForBurnBlock[];
  nextTimestamp?: number;
  burnBlocks: ApiBurnBlock[];
  maxProcessedHeight: number;
}) {
  const [expanded, setExpanded] = React.useState(false);
  const setActiveBlockHash = useSetAtom(activeBlockHashAtom);
  const sorted = [...blocks].sort(
    (a, b) => timestampForBlock(b) - timestampForBlock(a)
  );
  const newest = sorted[0];
  const oldest = sorted.at(-1);
  if (!(newest && oldest)) return null;
  const color = tenureColor(newest.burnBlockHeight);
  const trailingGap = nextTimestamp
    ? timestampForBlock(oldest) - nextTimestamp
    : 0;
  const duration = timestampForBlock(newest) - timestampForBlock(oldest);
  const rejectedCount = sorted.filter(
    (block) => statusForBlock(block, maxProcessedHeight) === 'rejected'
  ).length;
  const confirmedCount = sorted.length - rejectedCount;
  const tenureChangeCount = sorted.filter(
    (block) => block.tenureChangeCause === TenureChangeCause.BlockFound
  ).length;
  const tenureExtendCount = sorted.filter((block) =>
    isTenureExtend(block.tenureChangeCause)
  ).length;
  const burnBlock = burnBlocks.find(
    (block) => block.consensusHash === newest.consensusHash
  );

  return (
    <div className="grid grid-cols-[62px_1fr] gap-3 md:grid-cols-[94px_1fr]">
      <div className="flex items-start justify-end pt-3 font-mono text-[10px] text-muted-foreground md:text-xs">
        {formatClock(timestampForBlock(oldest))}
      </div>
      <div
        className="relative border-l py-1 pl-3"
        style={{ borderColor: color }}
      >
        <div className="border border-border bg-muted/10 font-mono">
          <button
            type="button"
            onClick={() => setExpanded((value) => !value)}
            className="flex w-full items-start gap-2 px-3 pb-1.5 pt-2 text-left transition-colors hover:bg-muted/30"
          >
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
                <span>
                  {blocks.length.toLocaleString()}{' '}
                  {blocks.length === 1 ? 'block' : 'blocks'}
                </span>
                {burnBlock && (
                  <span
                    className="border px-1.5 py-0.5 text-[9px]"
                    style={{ borderColor: color, color }}
                  >
                    btc #{burnBlock.burnBlockHeight.toLocaleString()}
                  </span>
                )}
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-x-2 text-[9px] text-muted-foreground md:text-[10px]">
                <span className="text-green-600 dark:text-green-400">
                  {confirmedCount} confirmed
                </span>
                {rejectedCount > 0 && (
                  <span className="text-destructive">
                    {rejectedCount} rejected
                  </span>
                )}
                {tenureChangeCount > 0 && (
                  <span className="text-cyan-600 dark:text-cyan-400">
                    {tenureChangeCount} tenure changes
                  </span>
                )}
                {tenureExtendCount > 0 && (
                  <span className="text-amber-600 dark:text-amber-400">
                    {tenureExtendCount} tenure extends
                  </span>
                )}
                <span>{formatDuration(duration)}</span>
              </div>
            </div>
            {expanded ? (
              <ChevronUpIcon className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            ) : (
              <ChevronDownIcon className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            )}
          </button>

          <div
            className="grid h-8 w-full items-end overflow-hidden border-t border-border/60 bg-background/40 px-1 py-1"
            style={{
              gridTemplateColumns: `repeat(${sorted.length}, minmax(0, 1fr))`,
            }}
          >
            {[...sorted].reverse().map((block, index, chronological) => {
              const previousBlock = chronological[index - 1];
              const gap = previousBlock
                ? timestampForBlock(block) - timestampForBlock(previousBlock)
                : trailingGap;
              const status = statusForBlock(block, maxProcessedHeight);
              const isTenureChange =
                block.tenureChangeCause === TenureChangeCause.BlockFound;
              const isTenureExtendBlock = isTenureExtend(
                block.tenureChangeCause
              );
              return (
                <button
                  type="button"
                  key={block.blockHash}
                  onClick={() => setActiveBlockHash(block.blockHash)}
                  className={cn(
                    'w-full opacity-80 transition-opacity hover:opacity-100 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring',
                    status === 'confirmed' ? 'bg-green-500' : 'bg-destructive'
                  )}
                  style={{
                    height: `${Math.min(24, Math.max(6, gap / 700))}px`,
                    boxShadow: isTenureExtendBlock
                      ? 'inset 0 2px 0 rgb(245 158 11)'
                      : isTenureChange
                        ? 'inset 0 2px 0 rgb(34 211 238)'
                        : undefined,
                  }}
                  title={`Stacks block ${block.blockHeight} · ${status}${isTenureExtendBlock ? ' · tenure extend' : isTenureChange ? ' · tenure change' : ''} · ${formatClock(timestampForBlock(block))} · anchored to Bitcoin #${burnBlock?.burnBlockHeight ?? 'unknown'} · click for details`}
                  aria-label={`Open Stacks block ${block.blockHeight}`}
                />
              );
            })}
          </div>
        </div>
        {expanded && (
          <div className="mt-1.5 flex flex-col gap-1.5">
            {sorted.map((block) => (
              <CompactBlock
                key={block.blockHash}
                block={block}
                color={color}
                maxProcessedHeight={maxProcessedHeight}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function CompactBlock({
  block,
  color,
  maxProcessedHeight,
}: {
  block: ApiBlockForBurnBlock;
  color: string;
  maxProcessedHeight: number;
}) {
  const setActiveBlockHash = useSetAtom(activeBlockHashAtom);
  const status = statusForBlock(block, maxProcessedHeight);
  return (
    <button
      type="button"
      onClick={() => setActiveBlockHash(block.blockHash)}
      className="flex min-h-8 items-center gap-2 border border-border bg-card px-2 text-left font-mono text-[10px] hover:bg-muted/40"
      style={{ borderLeftColor: color, borderLeftWidth: 2 }}
      title={`Stacks block ${block.blockHeight} · click for details`}
    >
      {status === 'confirmed' ? (
        <CheckIcon className="h-3 w-3 text-green-600 dark:text-green-400" />
      ) : (
        <XIcon className="h-3 w-3 text-destructive" />
      )}
      <span className="flex-1">block {block.blockHeight.toLocaleString()}</span>
      {block.tenureChangeCause === TenureChangeCause.BlockFound && (
        <span className="text-cyan-600 dark:text-cyan-400">tenure change</span>
      )}
      {isTenureExtend(block.tenureChangeCause) && (
        <span className="text-amber-600 dark:text-amber-400">tenure extend</span>
      )}
      <span className="text-muted-foreground">
        {formatClock(timestampForBlock(block))}
      </span>
    </button>
  );
}

function TimelineInner() {
  const { burnBlocks, stacksBlocks } = useAtomValue(timelineDataAtom);
  const maxProcessedHeight = useAtomValue(maxProcessedStacksHeightAtom);
  const loadMoreBurnBlocks = useSetAtom(loadMoreBurnBlocksAtom);
  const [now, setNow] = React.useState(Date.now());
  const [isLoadingMore, setIsLoadingMore] = React.useState(false);

  React.useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  const events = React.useMemo(
    () => makeEvents(burnBlocks, stacksBlocks),
    [burnBlocks, stacksBlocks]
  );
  const segments = React.useMemo(() => makeSegments(events), [events]);

  return (
    <div className="flex w-full flex-col gap-5">
      <HealthMetrics blocks={stacksBlocks} burnBlocks={burnBlocks} now={now} />

      <section aria-label="Realtime block timeline">
        <div>
          {segments.map((segment, index) => {
            if (segment.kind === 'bundle') {
              const nextSegment = segments[index + 1];
              return (
                <SettledBundle
                  key={`bundle-${segment.blocks[0]?.blockHash ?? index}`}
                  blocks={segment.blocks}
                  nextTimestamp={timestampForSegment(nextSegment)}
                  burnBlocks={burnBlocks}
                  maxProcessedHeight={maxProcessedHeight}
                />
              );
            }
            if (segment.kind === 'bitcoin') {
              return (
                <BitcoinEvent
                  key={segment.block.burnBlockHash}
                  event={segment}
                  allBlocks={stacksBlocks}
                />
              );
            }
            return (
              <StacksEvent
                key={segment.block.blockHash}
                event={segment}
                status={statusForBlock(segment.block, maxProcessedHeight)}
              />
            );
          })}
        </div>
      </section>

      <div className="flex justify-center">
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="font-mono"
          disabled={isLoadingMore}
          onClick={async () => {
            setIsLoadingMore(true);
            try {
              await loadMoreBurnBlocks();
            } finally {
              setIsLoadingMore(false);
            }
          }}
        >
          {isLoadingMore ? 'loading...' : 'view more'}
        </Button>
      </div>
      <BlockModal />
    </div>
  );
}

export function Timeline() {
  const loaderData = Route.useLoaderData();
  const setBurnBlocks = useSetAtom(setAllBurnBlocksAtom);
  const setSigners = useSetAtom(setSignersApiAtom);

  React.useEffect(() => {
    setBurnBlocks(loaderData.burnBlocks);
    setSigners(loaderData.signers, loaderData.network ?? 'mainnet');
  }, [loaderData, setBurnBlocks, setSigners]);

  return (
    <React.Suspense
      fallback={
        <div className="flex min-h-[50vh] items-center justify-center font-mono text-xs text-muted-foreground">
          <RadioIcon className="mr-2 h-4 w-4 animate-pulse" /> loading live
          activity...
        </div>
      }
    >
      <TimelineInner />
    </React.Suspense>
  );
}
