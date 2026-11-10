/**
 * Pure logic for the Bitcoin block arrival route: picking the canonical burn
 * block per height, choosing a block time source, guarding ingest-time
 * fallbacks, and parsing `?heights=`. No DB, no Workers APIs: unit-testable
 * with `bun test`.
 *
 * All times are unix SECONDS.
 */

import type { ArrivalSample, ArrivalTimeSource } from 'slot-watch-common';

/** A `burn_blocks` row, reduced to what the arrival route needs. */
export interface BurnRowLite {
  /** UUIDv7 primary key; its timestamp is the ingest time. */
  id: string;
  height: number;
  hash: string;
  consensusHash: string;
}

/** A header timestamp for a block hash (from `bitcoin_blocks` or `stacks_blocks`), unix seconds. */
export interface HeaderTime {
  hash: string;
  time: number;
}

export interface TimePoint {
  height: number;
  time: number;
}

export interface ResolvedTime extends TimePoint {
  source: ArrivalTimeSource;
}

/** Tunables of the ingest-time guard. */
export const INGEST_GUARD = {
  /** Base allowed deviation from the header-implied time, seconds. */
  baseToleranceSeconds: 3600,
  /** Extra tolerance per sqrt(blocks to the nearest header neighbour), seconds (block-time noise). */
  perSqrtBlockSeconds: 600,
  /** Two adjacent heights ingested this close together look like a backfill burst. */
  burstGapSeconds: 2,
  /** A burst member is still accepted when this close to the header trend. */
  burstTrendSeconds: 600,
  /** Seconds per block assumed when extrapolating from a single header neighbour. */
  nominalBlockSeconds: 600,
} as const;

const HEX_TIMESTAMP_CHARS = 12;
const UUID_V7_VERSION_INDEX = 12;
const HEX = 16;
const MS_PER_SECOND = 1000;
const HEX_ONLY = /^[0-9a-f]+$/i;

/** Ingest time (unix seconds) from a UUIDv7 id; null if `id` is not a valid UUIDv7. Never throws or logs. */
export function uuidV7Seconds(id: string): number | null {
  const clean = id.replace(/-/g, '');
  if (clean.length !== 32 || clean[UUID_V7_VERSION_INDEX] !== '7') {
    return null;
  }
  const head = clean.slice(0, HEX_TIMESTAMP_CHARS);
  if (!HEX_ONLY.test(head)) {
    return null;
  }
  return Math.floor(Number.parseInt(head, HEX) / MS_PER_SECOND);
}

/**
 * Canonical burn block per height. Rule (the same as `GET
 * /burn-blocks/:networkKey/:heightOrHash`, which orders by `id DESC LIMIT 1`):
 * when a height has several hashes (a Bitcoin reorg), the most recently
 * ingested row wins, since the node announces the replacement block after the
 * orphaned one. UUIDv7 ids sort chronologically, so this is the largest id.
 * Canonicality was never checked against Bitcoin itself.
 */
export function pickCanonicalBurnRows(
  rows: readonly BurnRowLite[]
): Map<number, BurnRowLite> {
  const byHeight = new Map<number, BurnRowLite>();
  for (const row of rows) {
    const current = byHeight.get(row.height);
    if (!current || row.id > current.id) {
      byHeight.set(row.height, row);
    }
  }
  return byHeight;
}

export type IngestGuardResult =
  | { ok: true; deviationSeconds: number }
  | { ok: false; reason: 'no-neighbour' | 'inconsistent' | 'burst' };

export interface IngestGuardInput {
  height: number;
  /** Ingest time of this height, unix seconds. */
  ingestTime: number;
  /** Nearest header-timed block below / above this height (any distance). */
  below?: TimePoint;
  above?: TimePoint;
  /** Ingest times of the adjacent heights (height - 1, height + 1) when known. */
  adjacentIngestTimes?: readonly number[];
}

/**
 * Decide whether an ingest time can stand in for a missing header time.
 *
 * Ingest time is when Slot Watch saw the block, which equals the mining time
 * only while ingest is live. After outages and backfills many blocks arrive in
 * a burst long after they were mined, so the time must be rejected, and a
 * missing sample is better than a wrong one (the model tolerates gaps).
 *
 * Rules:
 * 1. Needs at least one header-timed neighbour; otherwise nothing to compare to
 *    (`no-neighbour`).
 * 2. Expected time: linear interpolation between the neighbours by height, or
 *    nominal 600 s/block from the single neighbour.
 * 3. Reject (`inconsistent`) when the deviation exceeds
 *    3,600 s + 600 s * sqrt(blocks to the nearest neighbour).
 * 4. Reject (`burst`) when an adjacent height was ingested within 2 s of this
 *    one AND this time is more than 600 s off the header trend.
 */
export function guardIngestTime(input: IngestGuardInput): IngestGuardResult {
  const { height, ingestTime, below, above } = input;
  if (!Number.isFinite(ingestTime)) {
    return { ok: false, reason: 'inconsistent' };
  }
  let expected: number;
  let distance: number;
  if (below && above && above.height > below.height) {
    const frac = (height - below.height) / (above.height - below.height);
    expected = below.time + frac * (above.time - below.time);
    distance = Math.min(height - below.height, above.height - height);
  } else if (below) {
    distance = height - below.height;
    expected = below.time + distance * INGEST_GUARD.nominalBlockSeconds;
  } else if (above) {
    distance = above.height - height;
    expected = above.time - distance * INGEST_GUARD.nominalBlockSeconds;
  } else {
    return { ok: false, reason: 'no-neighbour' };
  }
  const deviation = ingestTime - expected;
  const tolerance =
    INGEST_GUARD.baseToleranceSeconds +
    INGEST_GUARD.perSqrtBlockSeconds * Math.sqrt(Math.max(1, distance));
  if (Math.abs(deviation) > tolerance) {
    return { ok: false, reason: 'inconsistent' };
  }
  const inBurst = (input.adjacentIngestTimes ?? []).some(
    (t) => Math.abs(t - ingestTime) < INGEST_GUARD.burstGapSeconds
  );
  if (inBurst && Math.abs(deviation) > INGEST_GUARD.burstTrendSeconds) {
    return { ok: false, reason: 'burst' };
  }
  return { ok: true, deviationSeconds: deviation };
}

export interface ResolveInput {
  /** Heights to resolve (any order, duplicates ignored). */
  heights: readonly number[];
  /** Canonical burn row per height (see `pickCanonicalBurnRows`). */
  canonical: ReadonlyMap<number, BurnRowLite>;
  /** `bitcoin_blocks.header_timestamp` by block hash. */
  bitcoinHeaders: readonly HeaderTime[];
  /** `stacks_blocks.burn_block_timestamp` by burn block hash. */
  stacksHeaders: readonly HeaderTime[];
  /** Extra header-timed points (e.g. cached samples) used only to validate ingest times. */
  anchors?: readonly TimePoint[];
}

export interface RejectedIngest {
  height: number;
  reason: 'no-neighbour' | 'inconsistent' | 'burst';
}

export interface ResolveResult {
  /** Resolved times, ascending by height. Heights with no trustworthy time are absent. */
  samples: ResolvedTime[];
  rejected: RejectedIngest[];
}

function headerMap(rows: readonly HeaderTime[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const row of rows) {
    if (!Number.isFinite(row.time)) {
      continue;
    }
    const existing = map.get(row.hash);
    // Several rows can share a hash (e.g. many Stacks blocks): keep the earliest.
    if (existing === undefined || row.time < existing) {
      map.set(row.hash, row.time);
    }
  }
  return map;
}

/** Heights whose canonical block has no `bitcoin_blocks` header time (candidates for the `stacks_blocks` fallback). */
export function heightsWithoutBitcoinHeader(
  heights: readonly number[],
  canonical: ReadonlyMap<number, BurnRowLite>,
  bitcoinHeaders: readonly HeaderTime[]
): number[] {
  const known = headerMap(bitcoinHeaders);
  return heights.filter((h) => {
    const row = canonical.get(h);
    return row !== undefined && !known.has(row.hash);
  });
}

function nearestBelow(
  sorted: readonly TimePoint[],
  height: number
): TimePoint | undefined {
  let found: TimePoint | undefined;
  for (const p of sorted) {
    if (p.height >= height) {
      break;
    }
    found = p;
  }
  return found;
}

function nearestAbove(
  sorted: readonly TimePoint[],
  height: number
): TimePoint | undefined {
  return sorted.find((p) => p.height > height);
}

/**
 * Per-height time, best source first:
 * 1. `bitcoin_blocks.header_timestamp` for the canonical hash;
 * 2. `stacks_blocks.burn_block_timestamp` for the canonical hash;
 * 3. ingest time (UUIDv7 of the burn block row), only if `guardIngestTime`
 *    accepts it against the header-timed neighbours.
 * Hash matching means a header recorded for an orphaned block at the same
 * height is never used.
 */
export function resolveTimes(input: ResolveInput): ResolveResult {
  const heights = [...new Set(input.heights)].sort((a, b) => a - b);
  const resolved = resolveHeaderTimes(heights, input);
  const rejected = resolveIngestTimes(heights, input, resolved);
  return {
    samples: [...resolved.values()].sort((a, b) => a.height - b.height),
    rejected,
  };
}

/** Steps 1 and 2: header times matched by canonical hash. */
function resolveHeaderTimes(
  heights: readonly number[],
  input: ResolveInput
): Map<number, ResolvedTime> {
  const bitcoin = headerMap(input.bitcoinHeaders);
  const stacks = headerMap(input.stacksHeaders);
  const resolved = new Map<number, ResolvedTime>();
  for (const height of heights) {
    const row = input.canonical.get(height);
    if (!row) {
      continue;
    }
    const fromBitcoin = bitcoin.get(row.hash);
    const fromStacks = stacks.get(row.hash);
    if (fromBitcoin !== undefined) {
      resolved.set(height, {
        height,
        time: fromBitcoin,
        source: 'header-bitcoin-blocks',
      });
    } else if (fromStacks !== undefined) {
      resolved.set(height, {
        height,
        time: fromStacks,
        source: 'header-stacks-blocks',
      });
    }
  }
  return resolved;
}

/** Step 3: guarded ingest times for heights still unresolved. Adds accepted ones to `resolved`. */
function resolveIngestTimes(
  heights: readonly number[],
  input: ResolveInput,
  resolved: Map<number, ResolvedTime>
): RejectedIngest[] {
  const headerPoints = new Map<number, TimePoint>();
  for (const a of input.anchors ?? []) {
    if (Number.isFinite(a.time)) {
      headerPoints.set(a.height, a);
    }
  }
  for (const r of resolved.values()) {
    headerPoints.set(r.height, r);
  }
  const sortedHeaders = [...headerPoints.values()].sort(
    (a, b) => a.height - b.height
  );
  const ingestAt = (height: number): number | null => {
    const row = input.canonical.get(height);
    return row ? uuidV7Seconds(row.id) : null;
  };

  const rejected: RejectedIngest[] = [];
  for (const height of heights) {
    const ingestTime = resolved.has(height) ? null : ingestAt(height);
    if (ingestTime === null) {
      continue;
    }
    const verdict = guardIngestTime({
      height,
      ingestTime,
      below: nearestBelow(sortedHeaders, height),
      above: nearestAbove(sortedHeaders, height),
      adjacentIngestTimes: [ingestAt(height - 1), ingestAt(height + 1)].filter(
        (t): t is number => t !== null
      ),
    });
    if (verdict.ok) {
      resolved.set(height, { height, time: ingestTime, source: 'ingest-time' });
    } else {
      rejected.push({ height, reason: verdict.reason });
    }
  }
  return rejected;
}

/** Apply the response-shape: samples only for the required heights. */
export function toApiSamples(
  resolved: readonly ResolvedTime[],
  required: ReadonlySet<number>
): ArrivalSample[] {
  return resolved
    .filter((r) => required.has(r.height))
    .map(({ height, time, source }) => ({ height, time, source }));
}

export const MAX_HEIGHTS_PARAM = 20;
/** Farthest requested height ahead of the tip (matches the model's horizon limit). */
export const MAX_AHEAD_BLOCKS = 10_000;
/** Farthest requested height behind the tip. */
export const MAX_BEHIND_BLOCKS = 2016;

export type HeightsParseResult =
  | { ok: true; heights: number[] }
  | { ok: false; error: string };

const DIGITS = /^\d{1,9}$/;

/** Parse `?heights=H1,H2,...`: 1..20 distinct non-negative integers (order kept). */
export function parseHeightsParam(raw: string): HeightsParseResult {
  const parts = raw.split(',').map((p) => p.trim());
  if (parts.length === 0 || parts.some((p) => !DIGITS.test(p))) {
    return { ok: false, error: 'heights must be comma-separated integers' };
  }
  const heights = [...new Set(parts.map(Number))];
  if (heights.length > MAX_HEIGHTS_PARAM) {
    return {
      ok: false,
      error: `at most ${MAX_HEIGHTS_PARAM} heights per request`,
    };
  }
  return { ok: true, heights };
}

/** Error message if `height` is outside the allowed window around the tip, else null. */
export function checkHeightWindow(
  height: number,
  tipHeight: number
): string | null {
  if (height > tipHeight + MAX_AHEAD_BLOCKS) {
    return `height ${height} is more than ${MAX_AHEAD_BLOCKS} blocks ahead of the tip (${tipHeight})`;
  }
  if (height < tipHeight - MAX_BEHIND_BLOCKS) {
    return `height ${height} is more than ${MAX_BEHIND_BLOCKS} blocks behind the tip (${tipHeight})`;
  }
  return null;
}
