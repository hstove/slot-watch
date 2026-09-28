import React from 'react';
import { Link, useRouter } from '@tanstack/react-router';
import { ReadyState } from 'react-use-websocket';
import type { MinerCommitsBlock } from 'slot-watch-common';
import { Route } from '../../../routes/miners/live';
import {
  type LastBlock,
  type LiveEvent,
  useMempoolCommits,
  useNow,
} from '@/hooks/use-mempool-commits';
import {
  buildLiveRows,
  formatFeeRate,
  type TrackedMiner,
  trackedMiners,
} from '@/lib/live-commits';
import type { LiveCommit } from '@/lib/mempool-space';
import { formatSats } from '@/lib/miner-economics';
import { formatTimestamp } from '@/hooks/use-timestamp';
import { cn } from '@/lib/utils';
import { Metric } from '../miner-overview';
import { FeeLadder, ProjectedBlocks } from './fee-ladder';
import { ago, LiveMinersTable, OddsBar } from './live-miners-table';

/** Give Slot Watch time to ingest a new block before refetching commits. */
const REFETCH_DELAY_MS = 20_000;

function PanelLabel({ children }: { children: React.ReactNode }) {
  return (
    <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
      {children}
    </span>
  );
}

function Panel({
  label,
  detail,
  children,
  className,
}: {
  label: string;
  detail?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn('min-w-0 border-t border-border px-3 py-2.5', className)}
    >
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <PanelLabel>{label}</PanelLabel>
        {detail ? <PanelLabel>{detail}</PanelLabel> : null}
      </div>
      {children}
    </div>
  );
}

const READY_LABELS: Record<ReadyState, [string, string]> = {
  [ReadyState.CONNECTING]: ['connecting', 'text-blue-500 animate-pulse'],
  [ReadyState.OPEN]: ['live', 'text-green-600 dark:text-green-500'],
  [ReadyState.CLOSING]: ['closing', 'text-destructive'],
  [ReadyState.CLOSED]: ['disconnected', 'text-destructive'],
  [ReadyState.UNINSTANTIATED]: ['idle', 'text-muted-foreground'],
};

export function LiveCommits() {
  const { tip: apiTip, commits } = Route.useLoaderData();
  const router = useRouter();
  const miners = React.useMemo(() => trackedMiners(commits.blocks), [commits]);
  const addresses = React.useMemo(
    () => miners.map((m) => m.btcAddress).sort(),
    [miners]
  );
  const { state, readyState, error } = useMempoolCommits(addresses);
  const now = useNow();
  const tipHeight = state.tip?.height ?? apiTip;

  const lastBlockHeight = state.lastBlock?.height;
  React.useEffect(() => {
    if (lastBlockHeight === undefined) return;
    const id = setTimeout(() => router.invalidate(), REFETCH_DELAY_MS);
    return () => clearTimeout(id);
  }, [lastBlockHeight, router]);

  const rows = React.useMemo(
    () =>
      buildLiveRows({
        miners,
        live: state.miners,
        blocks: commits.blocks,
        mempoolBlocks: state.mempoolBlocks,
        tipHeight,
      }),
    [miners, state.miners, commits, state.mempoolBlocks, tipHeight]
  );
  const byAddress = React.useMemo(
    () => new Map(miners.map((m) => [m.btcAddress, m])),
    [miners]
  );

  const live = rows.filter((r) => r.pending && !r.stale);
  const totalBid = live.reduce((s, r) => s + (r.pending?.bidSats ?? 0), 0);
  const rbfs = rows.reduce((s, r) => s + (r.live?.replaced.length ?? 0), 0);
  const next = state.mempoolBlocks[0];
  const [readyLabel, readyClass] = READY_LABELS[readyState];
  const tipAt =
    state.lastBlock?.receivedAt ??
    (state.tip ? state.tip.timestamp * 1000 : null);

  return (
    <div className="flex flex-col gap-2">
      <section className="border border-border bg-card">
        <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <h1 className="font-mono text-sm font-medium">live commits</h1>
            <span className="font-mono text-[10px] text-muted-foreground tabular-nums">
              btc tip #{tipHeight.toLocaleString()}
              {tipAt ? ` · ${ago(now - tipAt)} ago` : ''}
            </span>
          </div>
          <div className="flex items-center gap-3 font-mono text-[10px]">
            <span className={readyClass}>● {readyLabel}</span>
            <a
              href="https://mempool.space"
              target="_blank"
              rel="noreferrer"
              className="text-muted-foreground hover:text-foreground"
            >
              → mempool.space
            </a>
            <Link
              to="/miners"
              className="text-muted-foreground hover:text-foreground"
            >
              → miners
            </Link>
          </div>
        </div>
        {error ? (
          <div className="border-t border-border px-3 py-1.5 font-mono text-[10px] text-destructive">
            × {error}
          </div>
        ) : null}
        <div className="grid grid-cols-1 border-t border-border sm:grid-cols-2 lg:grid-cols-4">
          <Metric
            label="live commits"
            value={`${live.length} / ${miners.length}`}
            detail={`${rows.filter((r) => r.stale).length} stale · miners from last ${commits.blocks.length} blocks`}
          />
          <Metric
            label="total bid"
            value={formatSats(totalBid)}
            detail="sats across live commits"
          />
          <Metric
            label="next block fee"
            value={next ? `${formatFeeRate(next.feeRange[0] ?? 0)}+` : '–'}
            detail={
              next
                ? `median ${formatFeeRate(next.medianFee)} sat/vB`
                : 'waiting for mempool'
            }
          />
          <Metric
            label="rbfs this round"
            value={rbfs.toLocaleString()}
            detail={
              state.lastBlock
                ? `since #${state.lastBlock.height}`
                : 'since page load'
            }
          />
        </div>
        <Panel
          label="projected blocks"
          detail="sat/vB · miner commits by block"
        >
          <ProjectedBlocks blocks={state.mempoolBlocks} rows={rows} />
        </Panel>
        <Panel
          label="commit fee rates"
          detail="log scale · sat/vB · dashed = next block median"
        >
          <FeeLadder rows={rows} blocks={state.mempoolBlocks} />
        </Panel>
        <Panel
          label="next sortition · est. odds"
          detail="min(bid, 6-block median) share"
        >
          <OddsBar rows={rows} />
        </Panel>
        <div className="border-t border-border">
          <LiveMinersTable rows={rows} now={now} />
        </div>
      </section>
      <section className="grid grid-cols-1 border border-border bg-card md:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
        <LastBlockPanel
          lastBlock={state.lastBlock}
          blocks={commits.blocks}
          miners={miners}
          byAddress={byAddress}
          now={now}
        />
        <Panel
          label="event log"
          detail={`${state.events.length} events`}
          className="border-t-0 md:border-l"
        >
          <EventLog events={state.events} byAddress={byAddress} />
        </Panel>
      </section>
    </div>
  );
}

function MinerTag({ miner }: { miner: TrackedMiner | undefined }) {
  if (!miner) return <span className="text-muted-foreground">unknown</span>;
  return (
    <span className="inline-flex items-center gap-1">
      <span className="h-2 w-2" style={{ backgroundColor: miner.color }} />
      {miner.label}
    </span>
  );
}

function LastBlockPanel({
  lastBlock,
  blocks,
  miners,
  byAddress,
  now,
}: {
  lastBlock: LastBlock | null;
  blocks: MinerCommitsBlock[];
  miners: TrackedMiner[];
  byAddress: Map<string, TrackedMiner>;
  now: number;
}) {
  const height = lastBlock?.height ?? blocks.at(-1)?.burnBlockHeight;
  const indexed = blocks.find((b) => b.burnBlockHeight === height);
  const byKey = new Map(miners.map((m) => [m.publicKey, m]));
  const winner = indexed?.commits.find((c) => c.txid === indexed.winningTxid);

  // Live data knows which pending commits missed the block; indexed data only
  // knows which landed.
  const included: {
    miner: TrackedMiner | undefined;
    bid: number;
    fee?: number;
    txid: string;
  }[] =
    lastBlock && lastBlock.included.length > 0
      ? lastBlock.included.map((c: LiveCommit) => ({
          miner: byAddress.get(c.btcAddress),
          bid: c.bidSats,
          fee: c.feeRate,
          txid: c.txid,
        }))
      : (indexed?.commits ?? []).map((c) => ({
          miner: c.minerPublicKey ? byKey.get(c.minerPublicKey) : undefined,
          bid: c.spendSats + c.burnSats,
          txid: c.txid,
        }));
  const includedAddresses = new Set(included.map((c) => c.miner?.btcAddress));
  const missed = lastBlock
    ? Object.values(lastBlock.pendingAtBlock).filter(
        (c) => !includedAddresses.has(c.btcAddress)
      )
    : [];

  return (
    <Panel
      label={height ? `last block · #${height.toLocaleString()}` : 'last block'}
      detail={
        lastBlock ? `${ago(now - lastBlock.receivedAt)} ago` : 'from slot watch'
      }
      className="border-t-0"
    >
      <div className="flex flex-col gap-2 font-mono text-[10px]">
        <div>
          <span className="text-muted-foreground">sortition winner </span>
          <WinnerLabel
            winner={
              winner?.minerPublicKey
                ? byKey.get(winner.minerPublicKey)
                : undefined
            }
            hasWinner={!!winner}
            indexed={!!indexed}
          />
        </div>
        <div>
          <div className="mb-1 text-muted-foreground uppercase tracking-wider">
            included ({included.length})
          </div>
          {included.length === 0 ? (
            <div className="text-muted-foreground">–</div>
          ) : (
            included
              .sort((a, b) => b.bid - a.bid)
              .map((c) => (
                <div
                  key={c.txid}
                  className="flex justify-between gap-3 border-b border-border/50 py-1 tabular-nums"
                >
                  <span className="flex items-center gap-1">
                    <MinerTag miner={c.miner} />
                    {c.txid === indexed?.winningTxid ? (
                      <span className="text-primary">★</span>
                    ) : null}
                  </span>
                  <span>
                    {formatSats(c.bid)} sats
                    {c.fee !== undefined ? (
                      <span className="text-muted-foreground">
                        {' '}
                        @ {formatFeeRate(c.fee)}
                      </span>
                    ) : null}
                  </span>
                </div>
              ))
          )}
        </div>
        {missed.length > 0 ? (
          <div>
            <div className="mb-1 text-destructive uppercase tracking-wider">
              missed ({missed.length})
            </div>
            {missed.map((c) => (
              <div
                key={c.txid}
                className="flex justify-between gap-3 border-b border-border/50 py-1 tabular-nums"
              >
                <MinerTag miner={byAddress.get(c.btcAddress)} />
                <span>
                  {formatSats(c.bidSats)} sats
                  <span className="text-muted-foreground">
                    {' '}
                    @ {formatFeeRate(c.feeRate)}
                  </span>
                </span>
              </div>
            ))}
          </div>
        ) : null}
      </div>
    </Panel>
  );
}

function WinnerLabel({
  winner,
  hasWinner,
  indexed,
}: {
  winner: TrackedMiner | undefined;
  hasWinner: boolean;
  indexed: boolean;
}) {
  if (hasWinner) return <MinerTag miner={winner} />;
  if (indexed) return <span className="text-muted-foreground">none</span>;
  return (
    <span className="animate-pulse text-blue-500">
      ◌ waiting for slot watch
    </span>
  );
}

function EventLog({
  events,
  byAddress,
}: {
  events: LiveEvent[];
  byAddress: Map<string, TrackedMiner>;
}) {
  if (events.length === 0) {
    return (
      <div className="font-mono text-[10px] text-muted-foreground">
        waiting for commits and blocks…
      </div>
    );
  }
  return (
    <div className="max-h-96 overflow-y-auto font-mono text-[10px]">
      {events.map((event) => (
        <div
          key={event.id}
          className={cn(
            'flex gap-2 border-b border-border/50 py-1 tabular-nums',
            event.kind === 'block' && 'bg-primary/10 text-primary'
          )}
        >
          <span className="shrink-0 text-muted-foreground">
            {
              formatTimestamp(new Date(event.at).toISOString())
                .timestampWithoutMillis
            }
          </span>
          {event.kind === 'block' ? (
            <span>btc block #{event.height.toLocaleString()} mined</span>
          ) : (
            <>
              <span className="shrink-0">
                <MinerTag miner={byAddress.get(event.commit.btcAddress)} />
              </span>
              <EventDetail event={event} />
            </>
          )}
        </div>
      ))}
    </div>
  );
}

function EventDetail({
  event,
}: {
  event: Exclude<LiveEvent, { kind: 'block' }>;
}) {
  const { commit } = event;
  const summary = `${formatSats(commit.bidSats)} sats @ ${formatFeeRate(commit.feeRate)} sat/vB`;
  switch (event.kind) {
    case 'new':
      return (
        <span>
          <span className="text-green-600 dark:text-green-500">new</span>{' '}
          {summary} · parent {commit.parentHeight}
        </span>
      );
    case 'rbf': {
      const { previous } = event;
      const parts = [
        previous.bidSats !== commit.bidSats &&
          `bid ${formatSats(previous.bidSats)} → ${formatSats(commit.bidSats)}`,
        `fee ${formatFeeRate(previous.feeRate)} → ${formatFeeRate(commit.feeRate)}`,
        previous.parentHeight !== commit.parentHeight &&
          `parent ${previous.parentHeight} → ${commit.parentHeight}`,
      ].filter(Boolean);
      return (
        <span>
          <span className="text-amber-600 dark:text-amber-500">rbf</span>{' '}
          {parts.join(' · ')}
        </span>
      );
    }
    case 'confirmed':
      return (
        <span>
          <span className="text-primary">confirmed</span> in #
          {commit.confirmedHeight} · {summary}
        </span>
      );
    default:
      return (
        <span>
          <span className="text-destructive">dropped</span> {summary}
        </span>
      );
  }
}
