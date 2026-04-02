import React from 'react';
import { Route } from '@/routes/state-machine-history';
import {
  type ApiStateMachineUpdate,
  percentString,
} from 'slot-watch-common';
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

type BaseState = {
  activeSignerProtocolVersion: number;
  burnBlockHeight: number;
  burnBlock: string;
  minerState: ApiStateMachineUpdate['minerState'];
  replayTxs: string[] | null;
};

type GroupedHistoryEntry = {
  state: BaseState;
  signers: { publicKey: string; weightPercent: number }[];
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

function buildSnapshots(
  updates: ApiStateMachineUpdate[],
  signers: ApiRecentSigners
): BurnBlockSnapshot[] {
  const signerWeightMap = new Map(
    signers.signers.map((s) => [s.publicKey, s.weightPercent])
  );

  // Group by burn block height
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

  // For each burn block, dedupe signers (keep latest per signer), then group by state
  const snapshots: BurnBlockSnapshot[] = [];
  for (const [burnBlockHeight, blockUpdates] of byBurnBlock) {
    // Keep only the latest update per signer for this burn block
    const latestPerSigner = new Map<string, ApiStateMachineUpdate>();
    for (const update of blockUpdates) {
      const existing = latestPerSigner.get(update.signerPublicKey);
      if (!existing || update.createdAt > existing.createdAt) {
        latestPerSigner.set(update.signerPublicKey, update);
      }
    }

    // Group by base state
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
        }));
        const signerWeightPercent = signerList.reduce(
          (acc, s) => acc + s.weightPercent,
          0
        );
        const timestamps = groupUpdates.map((u) => u.createdAt);
        return {
          state,
          signers: signerList,
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

function HistoryGroupCard({ group }: { group: GroupedHistoryEntry }) {
  const { state, signerWeightPercent, signerWeightPercentStr } = group;
  const isConsensus = signerWeightPercent >= 0.7;

  return (
    <Card
      className={cn(
        'overflow-hidden',
        isConsensus ? 'border-green-500 border-2' : ''
      )}
    >
      <CardHeader className="pb-2">
        <div className="flex justify-between items-center">
          <CardTitle className="text-sm flex items-center gap-2">
            {isConsensus && <Badge className="bg-green-500">Consensus</Badge>}
            <span className="text-muted-foreground">
              {group.signers.length} signer
              {group.signers.length !== 1 ? 's' : ''}
            </span>
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
        </div>
      </CardContent>
    </Card>
  );
}

function TimelineEntry({ snapshot }: { snapshot: BurnBlockSnapshot }) {
  return (
    <div className="relative pl-8 pb-8 border-l-2 border-muted-foreground/20 last:border-l-0">
      <div className="absolute -left-2 top-0 w-4 h-4 rounded-full bg-primary border-2 border-background" />
      <div className="flex flex-col gap-1 mb-3">
        <div className="flex items-center gap-3">
          <span className="font-mono font-bold text-lg">
            Block {snapshot.burnBlockHeight}
          </span>
          <PublicKey
            publicKey={snapshot.burnBlock}
            className="text-muted-foreground"
          />
        </div>
        <Timestamp timestamp={snapshot.timestamp} className="text-xs text-muted-foreground" />
      </div>
      <div
        className={cn(
          'grid grid-cols-1 gap-3',
          snapshot.groups.length > 1 ? 'md:grid-cols-2' : ''
        )}
      >
        {snapshot.groups.map((group, i) => (
          <HistoryGroupCard key={i} group={group} />
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
        {snapshots.map((snapshot) => (
          <TimelineEntry
            key={snapshot.burnBlockHeight}
            snapshot={snapshot}
          />
        ))}
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
