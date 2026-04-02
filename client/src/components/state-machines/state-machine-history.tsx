import React from 'react';
import { Route } from '@/routes/state-machine-history';
import { type ApiStateMachineUpdate, percentString } from 'slot-watch-common';
import type { ApiRecentSigners } from '@/lib/slots-api';
import { getStateMachineHistory } from '@/lib/slots-api';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { PublicKey } from '@/components/public-key';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { dequal } from 'dequal';
import { Timestamp } from '@/components/timestamp';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { ChevronRight } from 'lucide-react';
import { getEntity } from '@/lib/local-signers';

type BaseState = {
  activeSignerProtocolVersion: number;
  burnBlockHeight: number;
  burnBlock: string;
  minerState: ApiStateMachineUpdate['minerState'];
  replayTxs: string[] | null;
};

type GroupedHistoryEntry = {
  state: BaseState;
  signers: { publicKey: string; weightPercent: number; updatedAt: string }[];
  signerWeightPercent: number;
  signerWeightPercentStr: string;
  earliestUpdate: string;
  latestUpdate: string;
};

type BurnBlockSnapshot = {
  burnBlockHeight: number;
  burnBlock: string;
  timestamp: string;
  groups: GroupedHistoryEntry[];
};

function getBaseState(update: ApiStateMachineUpdate): BaseState {
  return {
    activeSignerProtocolVersion: update.activeSignerProtocolVersion,
    burnBlockHeight: update.burnBlockHeight,
    burnBlock: update.burnBlock,
    minerState: update.minerState,
    replayTxs: update.replayTxs,
  };
}

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: allowed
function buildSnapshots(
  updates: ApiStateMachineUpdate[],
  signers: ApiRecentSigners
): BurnBlockSnapshot[] {
  const signerWeightMap = new Map(
    signers.signers.map((s) => [s.publicKey, s.weightPercent])
  );

  const byBurnBlock = new Map<number, ApiStateMachineUpdate[]>();
  for (const update of updates) {
    const key = update.burnBlockHeight;
    const existing = byBurnBlock.get(key);
    if (existing) {
      existing.push(update);
    } else {
      byBurnBlock.set(key, [update]);
    }
  }

  const snapshots: BurnBlockSnapshot[] = [];
  for (const [burnBlockHeight, blockUpdates] of byBurnBlock) {
    const latestPerSigner = new Map<string, ApiStateMachineUpdate>();
    for (const update of blockUpdates) {
      const existing = latestPerSigner.get(update.signerPublicKey);
      if (!existing || update.createdAt > existing.createdAt) {
        latestPerSigner.set(update.signerPublicKey, update);
      }
    }

    const groups: [BaseState, ApiStateMachineUpdate[]][] = [];
    for (const update of latestPerSigner.values()) {
      const base = getBaseState(update);
      const existingGroup = groups.find(([b]) => dequal(b, base));
      if (existingGroup) {
        existingGroup[1].push(update);
      } else {
        groups.push([base, [update]]);
      }
    }

    const groupedEntries: GroupedHistoryEntry[] = groups
      .map(([state, groupUpdates]) => {
        const signerList = groupUpdates.map((u) => ({
          publicKey: u.signerPublicKey,
          weightPercent: signerWeightMap.get(u.signerPublicKey) ?? 0,
          updatedAt: u.createdAt,
        }));
        const signerWeightPercent = signerList.reduce(
          (acc, s) => acc + s.weightPercent,
          0
        );
        const timestamps = groupUpdates.map((u) => u.createdAt);
        return {
          state,
          signers: signerList.sort((a, b) => b.weightPercent - a.weightPercent),
          signerWeightPercent,
          signerWeightPercentStr: percentString(signerWeightPercent),
          earliestUpdate: timestamps.reduce((a, b) => (a < b ? a : b)),
          latestUpdate: timestamps.reduce((a, b) => (a > b ? a : b)),
        };
      })
      .sort((a, b) => b.signerWeightPercent - a.signerWeightPercent);

    const latestTimestamp = groupedEntries[0]?.latestUpdate ?? '';
    snapshots.push({
      burnBlockHeight,
      burnBlock: blockUpdates[0]?.burnBlock ?? '',
      timestamp: latestTimestamp,
      groups: groupedEntries,
    });
  }

  return snapshots.sort((a, b) => b.burnBlockHeight - a.burnBlockHeight);
}

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: allowed
function describeChanges(
  current: BurnBlockSnapshot,
  previous: BurnBlockSnapshot | undefined
): string[] {
  if (!previous) return ['First observed state'];
  const changes: string[] = [];

  if (current.burnBlockHeight !== previous.burnBlockHeight) {
    changes.push(
      `Burn block ${previous.burnBlockHeight} → ${current.burnBlockHeight}`
    );
  }

  const prevConsensus = previous.groups[0];
  const currConsensus = current.groups[0];
  if (!(prevConsensus && currConsensus)) return changes;

  const prevMiner = prevConsensus.state.minerState;
  const currMiner = currConsensus.state.minerState;

  if (prevMiner.variant !== currMiner.variant) {
    changes.push(
      `Miner ${prevMiner.variant === 0 ? 'Inactive' : 'Active'} → ${currMiner.variant === 0 ? 'Inactive' : 'Active'}`
    );
  } else if (
    currMiner.variant === 1 &&
    prevMiner.variant === 1 &&
    currMiner.currentMinerPkh !== prevMiner.currentMinerPkh
  ) {
    changes.push('Miner changed');
  }

  if (
    currMiner.variant === 1 &&
    prevMiner.variant === 1 &&
    currMiner.tenureId !== prevMiner.tenureId
  ) {
    changes.push('New tenure');
  }

  if (
    prevConsensus.state.activeSignerProtocolVersion !==
    currConsensus.state.activeSignerProtocolVersion
  ) {
    changes.push(
      `Protocol v${prevConsensus.state.activeSignerProtocolVersion} → v${currConsensus.state.activeSignerProtocolVersion}`
    );
  }

  const prevGroupCount = previous.groups.length;
  const currGroupCount = current.groups.length;
  if (currGroupCount > 1 && prevGroupCount <= 1) {
    changes.push('Signers diverged');
  } else if (currGroupCount <= 1 && prevGroupCount > 1) {
    changes.push('Signers converged');
  }

  if (changes.length === 0) {
    changes.push('State updated');
  }

  return changes;
}

function SignerList({ signers }: { signers: GroupedHistoryEntry['signers'] }) {
  return (
    <div className="grid grid-cols-1 gap-1 pt-2">
      {[...signers]
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
        .map((signer) => {
          const entity = getEntity(signer.publicKey);
          return (
            <div
              key={signer.publicKey}
              className="grid grid-cols-5 items-center gap-2 text-xs"
            >
              <PublicKey publicKey={signer.publicKey} />
              {entity ? (
                <span className="text-muted-foreground truncate">{entity}</span>
              ) : (
                <div />
              )}
              <Timestamp
                timestamp={signer.updatedAt}
                className="text-muted-foreground text-xs font-mono"
              />
              <span className="text-muted-foreground ml-auto font-mono col-span-2 text-right">
                {percentString(signer.weightPercent)}%
              </span>
            </div>
          );
        })}
    </div>
  );
}

function HistoryGroupCard({
  group,
  isConsensusGroup,
}: {
  group: GroupedHistoryEntry;
  isConsensusGroup: boolean;
}) {
  const { state, signerWeightPercent, signerWeightPercentStr } = group;
  const [open, setOpen] = React.useState(false);

  return (
    <Card
      className={cn(
        'overflow-hidden',
        isConsensusGroup ? 'border-green-500 border-2' : 'border-orange-500/50'
      )}
    >
      <CardHeader className="pb-2">
        <div className="flex justify-between items-center">
          <CardTitle className="text-sm flex items-center gap-2">
            {isConsensusGroup ? (
              <Badge className="bg-green-500">Consensus</Badge>
            ) : (
              <Badge
                variant="outline"
                className="border-orange-500/50 text-orange-500"
              >
                Minority
              </Badge>
            )}
          </CardTitle>
          <Badge
            variant={state.minerState.variant === 0 ? 'outline' : 'default'}
          >
            {state.minerState.variant === 0 ? 'Inactive' : 'Active'} Miner
          </Badge>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <div className="flex justify-between text-sm">
              <span>Signer Weight</span>
              <span className="font-medium">({signerWeightPercentStr}%)</span>
            </div>
            <Progress value={signerWeightPercent * 100} className="h-2" />
          </div>

          <div className="text-sm">
            <span className="text-muted-foreground">Protocol Version:</span>{' '}
            <span className="font-medium">
              {state.activeSignerProtocolVersion}
            </span>
          </div>

          {state.minerState.variant === 1 && (
            <div className="space-y-2 pt-2 border-t text-sm">
              <div>
                <span className="text-muted-foreground">Current Miner:</span>
                <div className="font-mono text-xs">
                  <PublicKey publicKey={state.minerState.currentMinerPkh} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <span className="text-muted-foreground">Tenure ID:</span>
                  <div className="font-mono text-xs">
                    <PublicKey publicKey={state.minerState.tenureId} />
                  </div>
                </div>
                <div>
                  <span className="text-muted-foreground">
                    Parent Block Height:
                  </span>
                  <div className="font-medium">
                    {state.minerState.parentTenureLastBlockHeight.toLocaleString()}
                  </div>
                </div>
              </div>
            </div>
          )}

          {state.replayTxs && state.replayTxs.length > 0 && (
            <div className="pt-2 border-t text-sm">
              <span className="text-muted-foreground">
                Replay Txs: {state.replayTxs.length}
              </span>
            </div>
          )}

          <Collapsible open={open} onOpenChange={setOpen}>
            <CollapsibleTrigger asChild>
              <button
                type="button"
                className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors pt-1"
              >
                <ChevronRight
                  className={cn(
                    'h-3 w-3 transition-transform',
                    open && 'rotate-90'
                  )}
                />
                {group.signers.length} signer
                {group.signers.length !== 1 ? 's' : ''}
              </button>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <SignerList signers={group.signers} />
            </CollapsibleContent>
          </Collapsible>
        </div>
      </CardContent>
    </Card>
  );
}

function TimelineEntry({
  snapshot,
  changes,
}: {
  snapshot: BurnBlockSnapshot;
  changes: string[];
}) {
  const hasMultipleGroups = snapshot.groups.length > 1;

  return (
    <div className="relative pl-8 pb-8 border-l-2 border-muted-foreground/20 last:border-l-0">
      <div
        className={cn(
          'absolute -left-2 top-0 w-4 h-4 rounded-full border-2 border-background',
          hasMultipleGroups ? 'bg-orange-500' : 'bg-primary'
        )}
      />
      <div className="flex flex-col gap-1 mb-3">
        <div className="flex items-center gap-3 flex-wrap">
          <span className="font-mono font-bold text-lg">
            Block {snapshot.burnBlockHeight}
          </span>
          <PublicKey
            publicKey={snapshot.burnBlock}
            className="text-muted-foreground"
          />
        </div>
        <Timestamp
          timestamp={snapshot.timestamp}
          className="text-xs text-muted-foreground"
        />
        <div className="flex flex-wrap gap-1.5 mt-1">
          {changes.map((change) => (
            <Badge
              key={change}
              variant="secondary"
              className="text-xs font-normal"
            >
              {change}
            </Badge>
          ))}
        </div>
      </div>
      <div
        className={cn(
          'grid grid-cols-1 gap-3',
          snapshot.groups.length > 1 ? 'md:grid-cols-2' : ''
        )}
      >
        {snapshot.groups.map((group, i) => (
          <HistoryGroupCard
            key={i}
            group={group}
            isConsensusGroup={i === 0 && group.signerWeightPercent >= 0.7}
          />
        ))}
      </div>
    </div>
  );
}

export function StateMachineHistory() {
  const loaderData = Route.useLoaderData();
  const [allUpdates, setAllUpdates] = React.useState(
    loaderData.history.stateMachines
  );
  const [cursor, setCursor] = React.useState(loaderData.history.lastId);
  const [loading, setLoading] = React.useState(false);
  const [hasMore, setHasMore] = React.useState(!!loaderData.history.lastId);
  const networkKey = loaderData.network ?? 'mainnet';

  React.useEffect(() => {
    setAllUpdates(loaderData.history.stateMachines);
    setCursor(loaderData.history.lastId);
    setHasMore(!!loaderData.history.lastId);
  }, [loaderData]);

  const snapshots = React.useMemo(
    () => buildSnapshots(allUpdates, loaderData.signers),
    [allUpdates, loaderData.signers]
  );

  const loadMore = async () => {
    if (!cursor || loading) return;
    setLoading(true);
    try {
      const data = await getStateMachineHistory(networkKey, cursor);
      setAllUpdates((prev) => [...prev, ...data.stateMachines]);
      setCursor(data.lastId);
      setHasMore(!!data.lastId && data.stateMachines.length > 0);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <h2 className="text-xl font-bold">State Machine History</h2>
      <div className="ml-2">
        {snapshots.map((snapshot, i) => {
          const prevSnapshot = snapshots[i + 1];
          const changes = describeChanges(snapshot, prevSnapshot);
          return (
            <TimelineEntry
              key={snapshot.burnBlockHeight}
              snapshot={snapshot}
              changes={changes}
            />
          );
        })}
      </div>
      {hasMore && (
        <Button
          variant="outline"
          onClick={loadMore}
          disabled={loading}
          className="self-center"
        >
          {loading ? 'Loading...' : 'Load more'}
        </Button>
      )}
    </div>
  );
}
