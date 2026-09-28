import React from 'react';
import { ReadyState } from 'react-use-websocket';
import {
  type AddressTransactions,
  type EsploraTx,
  type LiveCommit,
  MEMPOOL_WS_URL,
  type MempoolBlock,
  type MempoolTipBlock,
  fetchAddressMempool,
  parseBlockCommit,
} from '@/lib/mempool-space';

const MAX_EVENTS = 200;
const RECONNECT_MS = 3000;

export interface MinerLiveState {
  pending: LiveCommit | null;
  /** Earlier versions of the pending commit, oldest first. */
  replaced: LiveCommit[];
  lastConfirmed: LiveCommit | null;
}

type LiveEventBody =
  | { kind: 'new' | 'confirmed' | 'dropped'; commit: LiveCommit }
  | { kind: 'rbf'; commit: LiveCommit; previous: LiveCommit }
  | { kind: 'block'; height: number };

export type LiveEvent = { id: number; at: number } & LiveEventBody;

export interface LastBlock {
  height: number;
  hash: string;
  receivedAt: number;
  /** Pending commits when the block arrived, keyed by BTC address. */
  pendingAtBlock: Record<string, LiveCommit>;
  included: LiveCommit[];
}

export interface LiveState {
  miners: Record<string, MinerLiveState>;
  mempoolBlocks: MempoolBlock[];
  tip: MempoolTipBlock | null;
  lastBlock: LastBlock | null;
  events: LiveEvent[];
}

type Action =
  | { type: 'seed'; address: string; txs: EsploraTx[] }
  | { type: 'address'; address: string; txs: AddressTransactions }
  | { type: 'mempool-blocks'; blocks: MempoolBlock[] }
  | { type: 'tip'; block: MempoolTipBlock; isNew: boolean };

const initialState: LiveState = {
  miners: {},
  mempoolBlocks: [],
  tip: null,
  lastBlock: null,
  events: [],
};

const emptyMiner: MinerLiveState = {
  pending: null,
  replaced: [],
  lastConfirmed: null,
};

let eventId = 0;
function pushEvents(state: LiveState, events: LiveEventBody[]) {
  if (events.length === 0) return state.events;
  const at = Date.now();
  const stamped = events.map(
    (event): LiveEvent => ({ ...event, id: ++eventId, at })
  );
  return [...stamped.reverse(), ...state.events].slice(0, MAX_EVENTS);
}

function commitsOf(txs: EsploraTx[], seenAt: number) {
  return txs.flatMap((tx) => parseBlockCommit(tx, seenAt) ?? []);
}

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: one pass per tx kind
function applyAddress(
  state: LiveState,
  address: string,
  txs: AddressTransactions
): LiveState {
  const now = Date.now();
  let miner = state.miners[address] ?? emptyMiner;
  let lastBlock = state.lastBlock;
  const events: LiveEventBody[] = [];

  for (const commit of commitsOf(txs.mempool, now)) {
    const previous = miner.pending;
    if (previous?.txid === commit.txid) continue;
    if (previous && previous.input === commit.input) {
      events.push({ kind: 'rbf', commit, previous });
      miner = {
        ...miner,
        pending: commit,
        replaced: [...miner.replaced, previous],
      };
    } else {
      events.push({ kind: 'new', commit });
      miner = { ...miner, pending: commit, replaced: [] };
    }
  }

  for (const tx of txs.removed) {
    if (miner.pending?.txid !== tx.txid) continue;
    events.push({ kind: 'dropped', commit: miner.pending });
    miner = { ...miner, pending: null, replaced: [] };
  }

  for (const commit of commitsOf(txs.confirmed, now)) {
    const height = commit.confirmedHeight ?? state.tip?.height ?? null;
    const confirmed = { ...commit, confirmedHeight: height };
    events.push({ kind: 'confirmed', commit: confirmed });
    miner = {
      pending: miner.pending?.txid === commit.txid ? null : miner.pending,
      replaced: miner.pending?.txid === commit.txid ? [] : miner.replaced,
      lastConfirmed: confirmed,
    };
    if (lastBlock && lastBlock.height === height) {
      lastBlock = {
        ...lastBlock,
        included: [
          ...lastBlock.included.filter((c) => c.btcAddress !== address),
          confirmed,
        ],
      };
    }
  }

  return {
    ...state,
    miners: { ...state.miners, [address]: miner },
    lastBlock,
    events: pushEvents(state, events),
  };
}

function reducer(state: LiveState, action: Action): LiveState {
  switch (action.type) {
    case 'seed': {
      const commits = commitsOf(action.txs, Date.now());
      const latest = commits.reduce<LiveCommit | null>(
        (best, c) => (!best || c.parentHeight > best.parentHeight ? c : best),
        null
      );
      const miner = state.miners[action.address] ?? emptyMiner;
      if (!latest || miner.pending?.txid === latest.txid) return state;
      return {
        ...state,
        miners: {
          ...state.miners,
          [action.address]: { ...miner, pending: latest, replaced: [] },
        },
      };
    }
    case 'address':
      return applyAddress(state, action.address, action.txs);
    case 'mempool-blocks':
      return { ...state, mempoolBlocks: action.blocks };
    default: {
      if (state.tip && action.block.height <= state.tip.height) return state;
      if (!action.isNew) return { ...state, tip: action.block };
      const pendingAtBlock: Record<string, LiveCommit> = {};
      for (const [address, miner] of Object.entries(state.miners)) {
        if (miner.pending) pendingAtBlock[address] = miner.pending;
      }
      return {
        ...state,
        tip: action.block,
        lastBlock: {
          height: action.block.height,
          hash: action.block.id,
          receivedAt: Date.now(),
          pendingAtBlock,
          included: [],
        },
        events: pushEvents(state, [
          { kind: 'block', height: action.block.height },
        ]),
      };
    }
  }
}

interface WsMessage {
  block?: MempoolTipBlock;
  blocks?: MempoolTipBlock[];
  'mempool-blocks'?: MempoolBlock[];
  'multi-address-transactions'?: Record<string, AddressTransactions>;
  'track-addresses-error'?: string;
}

function handleMessage(
  msg: WsMessage,
  dispatch: React.Dispatch<Action>,
  setError: (error: string) => void
) {
  // A new block's message also carries its confirmed commits, so the tip must
  // advance first.
  const latest = msg.blocks?.reduce<MempoolTipBlock | undefined>(
    (best, b) => (!best || b.height > best.height ? b : best),
    undefined
  );
  if (latest) dispatch({ type: 'tip', block: latest, isNew: false });
  if (msg.block) dispatch({ type: 'tip', block: msg.block, isNew: true });
  if (msg['mempool-blocks']) {
    dispatch({ type: 'mempool-blocks', blocks: msg['mempool-blocks'] });
  }
  for (const [address, txs] of Object.entries(
    msg['multi-address-transactions'] ?? {}
  )) {
    dispatch({ type: 'address', address, txs });
  }
  if (msg['track-addresses-error']) setError(msg['track-addresses-error']);
}

/**
 * Streams block commits for `addresses` from the mempool.space websocket,
 * along with the projected mempool blocks and the Bitcoin tip.
 */
export function useMempoolCommits(addresses: string[]) {
  const [state, dispatch] = React.useReducer(reducer, initialState);
  const [error, setError] = React.useState<string | null>(null);
  const addressKey = addresses.join(',');

  const socketRef = React.useRef<WebSocket | null>(null);
  const [readyState, setReadyState] = React.useState(ReadyState.CONNECTING);

  React.useEffect(() => {
    let closed = false;
    let retry: ReturnType<typeof setTimeout> | undefined;
    const connect = () => {
      const ws = new WebSocket(MEMPOOL_WS_URL);
      socketRef.current = ws;
      setReadyState(ReadyState.CONNECTING);
      ws.onopen = () => {
        ws.send(
          JSON.stringify({ action: 'want', data: ['blocks', 'mempool-blocks'] })
        );
        setReadyState(ReadyState.OPEN);
      };
      ws.onmessage = (event) => {
        handleMessage(JSON.parse(event.data as string), dispatch, setError);
      };
      ws.onclose = () => {
        setReadyState(ReadyState.CLOSED);
        if (!closed) retry = setTimeout(connect, RECONNECT_MS);
      };
    };
    connect();
    return () => {
      closed = true;
      clearTimeout(retry);
      socketRef.current?.close();
    };
  }, []);

  // (Re)subscribe whenever the socket opens or the address set changes, then
  // backfill commits that entered the mempool before the subscription.
  // biome-ignore lint/correctness/useExhaustiveDependencies: keyed by addressKey
  React.useEffect(() => {
    const ws = socketRef.current;
    if (readyState !== ReadyState.OPEN || !ws || addresses.length === 0) return;
    ws.send(JSON.stringify({ 'track-addresses': addresses }));
    let cancelled = false;
    for (const address of addresses) {
      fetchAddressMempool(address)
        .then((txs) => {
          if (!cancelled) dispatch({ type: 'seed', address, txs });
        })
        .catch(() => {
          // The websocket still reports commits broadcast from here on.
        });
    }
    return () => {
      cancelled = true;
    };
  }, [readyState, addressKey]);

  return { state, readyState, error };
}

export function useNow(intervalMs = 1000) {
  const [now, setNow] = React.useState(() => Date.now());
  React.useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}
