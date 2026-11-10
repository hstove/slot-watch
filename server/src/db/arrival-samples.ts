import { and, desc, eq, inArray } from 'drizzle-orm';
import {
  type ArrivalSample,
  type ArrivalTip,
  requiredHeights,
} from 'slot-watch-common';
import {
  type BurnRowLite,
  type HeaderTime,
  heightsWithoutBitcoinHeader,
  pickCanonicalBurnRows,
  resolveTimes,
  type ResolveResult,
  type TimePoint,
  toApiSamples,
  uuidV7Seconds,
} from '../arrival/assemble';
import { memoizeCache } from '../cache';
import { log } from '../logger';
import type { Db } from './db';
import { bitcoinBlocks, burnBlocks, stacksBlocks } from './schema';

/** Cached payload: the tip and the compact sample set. Plain JSON. */
export interface ArrivalSamplesPayload {
  tip: ArrivalTip;
  samples: ArrivalSample[];
}

/** How long a (tip height, tip hash) sample payload may be reused, seconds. */
export const ARRIVAL_CACHE_TTL_SECONDS = 120;

const toSeconds = (date: Date) => Math.floor(date.getTime() / 1000);

/**
 * Query 1. The newest burn block: highest height, newest ingest on ties (the
 * same rule as the canonical pick). Uses `burn_blocks_burn_block_height_idx`.
 */
export async function fetchTipRow(
  db: Db,
  networkKey: string
): Promise<BurnRowLite | null> {
  const [row] = await db
    .select({
      id: burnBlocks.id,
      height: burnBlocks.burnBlockHeight,
      hash: burnBlocks.burnBlockHash,
      consensusHash: burnBlocks.consensusHash,
    })
    .from(burnBlocks)
    .where(eq(burnBlocks.networkKey, networkKey))
    .orderBy(desc(burnBlocks.burnBlockHeight), desc(burnBlocks.id))
    .limit(1);
  return row ?? null;
}

export interface ResolvedHeights extends ResolveResult {
  canonical: Map<number, BurnRowLite>;
}

/**
 * Resolve block times for exactly `heights`. At most three queries, all by
 * indexed height / consensus hash, never a range scan:
 *
 * 2. `burn_blocks WHERE network_key = $1 AND burn_block_height IN (...)`
 *    (index `burn_blocks_burn_block_height_idx`)
 * 3. `bitcoin_blocks WHERE network_key = $1 AND burn_block_height IN (...)`
 *    (index `bitcoin_blocks_network_key_height_idx`); runs in parallel with 2
 * 4. only if some canonical blocks still lack a header time:
 *    `SELECT DISTINCT ON (burn_block_hash) ... FROM stacks_blocks WHERE
 *    network_key = $1 AND consensus_hash IN (...) AND burn_block_hash IN (...)
 *    ORDER BY burn_block_hash, burn_block_timestamp`
 *    (index `stacks_blocks_consensus_hash_network_key_idx`; `stacks_blocks`
 *    has no index on burn height or burn hash, hence the consensus hash).
 *    That finds Stacks blocks of the tenure won at that burn block, so burn
 *    blocks whose sortition had no winner get no `stacks_blocks` time.
 */
export async function resolveHeightTimes(
  db: Db,
  networkKey: string,
  heights: readonly number[],
  anchors: readonly TimePoint[] = []
): Promise<ResolvedHeights> {
  const wanted = [...new Set(heights)];
  if (wanted.length === 0) {
    return { canonical: new Map(), samples: [], rejected: [] };
  }
  const [burnRows, bitcoinRows] = await Promise.all([
    db
      .select({
        id: burnBlocks.id,
        height: burnBlocks.burnBlockHeight,
        hash: burnBlocks.burnBlockHash,
        consensusHash: burnBlocks.consensusHash,
      })
      .from(burnBlocks)
      .where(
        and(
          eq(burnBlocks.networkKey, networkKey),
          inArray(burnBlocks.burnBlockHeight, wanted)
        )
      ),
    db
      .select({
        hash: bitcoinBlocks.burnBlockHash,
        headerTimestamp: bitcoinBlocks.headerTimestamp,
      })
      .from(bitcoinBlocks)
      .where(
        and(
          eq(bitcoinBlocks.networkKey, networkKey),
          inArray(bitcoinBlocks.burnBlockHeight, wanted)
        )
      ),
  ]);
  const canonical = pickCanonicalBurnRows(burnRows);
  const bitcoinHeaders: HeaderTime[] = [];
  for (const row of bitcoinRows) {
    if (row.headerTimestamp) {
      bitcoinHeaders.push({
        hash: row.hash,
        time: toSeconds(row.headerTimestamp),
      });
    }
  }

  const stacksHeaders: HeaderTime[] = [];
  const missing = heightsWithoutBitcoinHeader(
    wanted,
    canonical,
    bitcoinHeaders
  );
  if (missing.length > 0) {
    const rows = missing.flatMap((h) => {
      const row = canonical.get(h);
      return row ? [row] : [];
    });
    const stacksRows = await db
      .selectDistinctOn([stacksBlocks.burnBlockHash], {
        hash: stacksBlocks.burnBlockHash,
        timestamp: stacksBlocks.burnBlockTimestamp,
      })
      .from(stacksBlocks)
      .where(
        and(
          eq(stacksBlocks.networkKey, networkKey),
          inArray(stacksBlocks.consensusHash, [
            ...new Set(rows.map((r) => r.consensusHash)),
          ]),
          inArray(stacksBlocks.burnBlockHash, [
            ...new Set(rows.map((r) => r.hash)),
          ])
        )
      )
      .orderBy(stacksBlocks.burnBlockHash, stacksBlocks.burnBlockTimestamp);
    for (const row of stacksRows) {
      stacksHeaders.push({ hash: row.hash, time: toSeconds(row.timestamp) });
    }
  }

  const resolved = resolveTimes({
    heights: wanted,
    canonical,
    bitcoinHeaders,
    stacksHeaders,
    anchors,
  });
  return { ...resolved, canonical };
}

/** Build the tip + sample payload for `requiredHeights(tip.height)`. Up to 3 queries after the tip query. */
export async function buildArrivalSamples(
  db: Db,
  networkKey: string,
  tipRow: BurnRowLite
): Promise<ArrivalSamplesPayload> {
  const required = requiredHeights(tipRow.height);
  const { samples, rejected } = await resolveHeightTimes(db, networkKey, [
    ...required,
    tipRow.height,
  ]);
  if (rejected.length > 0) {
    log
      .withMetadata({
        topic: 'arrival',
        rejected: rejected.length,
        reasons: rejected.slice(0, 10),
      })
      .warn('Rejected ingest-time samples');
  }
  const tipSample = samples.find((s) => s.height === tipRow.height);
  let tip: ArrivalTip | null = null;
  if (tipSample) {
    tip = {
      height: tipRow.height,
      hash: tipRow.hash,
      time: tipSample.time,
      timeSource: tipSample.source,
    };
  } else {
    // The tip must have a time. Fall back to its raw ingest time even though
    // the guard did not vouch for it: the tip is normally ingested live.
    const ingest = uuidV7Seconds(tipRow.id);
    if (ingest !== null) {
      tip = {
        height: tipRow.height,
        hash: tipRow.hash,
        time: ingest,
        timeSource: 'ingest-time',
      };
    }
  }
  if (!tip) {
    throw new Error('Tip burn block has no usable time');
  }
  return { tip, samples: toApiSamples(samples, new Set(required)) };
}

/**
 * Tip + samples, cached in KV by (height, hash) of the tip for
 * {@link ARRIVAL_CACHE_TTL_SECONDS}. The tip itself is looked up on every
 * request, so a new burn block (or a reorged hash) changes the key and
 * invalidates the entry; within a key the only staleness is that headers or
 * Stacks blocks which land later than the first request (e.g. a tip whose
 * time came from ingest time, or a `bitcoin_blocks` row arriving a few
 * seconds after the burn block) are not picked up for up to two minutes.
 * KV can be missing or read-only (preview stages): any cache failure falls
 * back to the freshly built payload, never to an error.
 */
export async function getArrivalSamples(
  db: Db,
  networkKey: string,
  tipRow: BurnRowLite
): Promise<ArrivalSamplesPayload> {
  let built: ArrivalSamplesPayload | undefined;
  let buildError: unknown;
  const cached = memoizeCache(
    (key: string, height: number, hash: string) =>
      `arrival_samples_${key}_${height}_${hash}`,
    async (key: string, _height: number, _hash: string) => {
      try {
        built = await buildArrivalSamples(db, key, tipRow);
        return built;
      } catch (error) {
        buildError = error;
        throw error;
      }
    },
    { ttl: ARRIVAL_CACHE_TTL_SECONDS }
  );
  try {
    return await cached.get(networkKey, tipRow.height, tipRow.hash);
  } catch (error) {
    if (buildError) {
      // The database failed, not the cache: do not retry the queries.
      throw buildError;
    }
    log
      .withError(error)
      .withMetadata({ topic: 'arrival', networkKey })
      .warn('Arrival sample cache unavailable, using uncached samples');
    return built ?? (await buildArrivalSamples(db, networkKey, tipRow));
  }
}
