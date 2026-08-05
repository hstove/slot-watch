/**
 * Pure aggregation helpers for the pre-commit metrics gauges.
 *
 * Split out of `metrics.ts` (which transitively imports `cloudflare:workers`)
 * so the threshold-crossing math is importable and testable on its own.
 *
 * Background — signers use a two-phase commit. A signer that considers a block
 * valid first broadcasts a `BlockPreCommit`, then waits for 70% of stake weight
 * (`ceil(total_weight * 7/10)`) to pre-commit before broadcasting its signed
 * `BlockResponse::Accepted`. So a healthy block crosses the same 70% bar twice,
 * pre-commit phase first. The gap between the two crossings is the signal that
 * catches a chain "stuck between phases".
 */

export type PhaseSigner = {
  signing_key: string;
  weight: number;
  /** When the signer's BlockResponse was observed, if it ever responded. */
  createdAt: Date | null;
  accepted: boolean | null;
  /**
   * When the signer's first explicit BlockPreCommit was observed. `null` for
   * signers running a binary that predates pre-commits — absence is a version
   * signal, not misbehavior.
   */
  preCommittedAt?: string | null;
  /** Proposal -> pre-commit latency, as recorded at ingestion. */
  preCommitLatencyMs?: number | null;
};

export type PhaseBlock = {
  totalWeight: number;
  signers: PhaseSigner[];
};

/** The same `ceil(total_weight * 7/10)` bar signers apply to both phases. */
export function weightThreshold(totalWeight: number) {
  return Math.ceil((totalWeight * 7) / 10);
}

/**
 * Time at which accumulated stake weight first reaches the 70% bar, walking
 * entries in observation order. `null` when the bar is never crossed.
 *
 * Entries with an unparseable timestamp are dropped rather than sorted, since
 * an `Invalid Date` would make the comparator inconsistent and silently produce
 * a wrong crossing. Timestamps reach us via a KV-cached payload, so a stale or
 * partially-written entry is possible.
 */
function crossingTime(
  entries: { at: Date; weight: number }[],
  totalWeight: number
) {
  const threshold = weightThreshold(totalWeight);
  const sorted = entries
    .filter((entry) => !Number.isNaN(entry.at.getTime()))
    .sort((a, b) => a.at.getTime() - b.at.getTime());
  let accumulated = 0;
  for (const entry of sorted) {
    accumulated += entry.weight;
    if (accumulated >= threshold) return entry.at;
  }
  return null;
}

/**
 * Gap (ms) between the block's two phase crossings: when 70% of weight had
 * pre-committed, and when 70% had accepted. `null` when either phase never
 * reached 70% — eg a rejected block, or one where too little weight runs a
 * pre-commit-capable binary. Callers exclude `null` from averages rather than
 * treating it as zero.
 */
export function preCommitToAcceptanceGapMs(
  signers: PhaseSigner[],
  totalWeight: number
) {
  const preCommitCrossing = crossingTime(
    signers
      .filter(
        (s): s is PhaseSigner & { preCommittedAt: string } =>
          typeof s.preCommittedAt === 'string'
      )
      .map((s) => ({ at: new Date(s.preCommittedAt), weight: s.weight })),
    totalWeight
  );
  if (!preCommitCrossing) return null;

  const acceptCrossing = crossingTime(
    signers
      .filter(
        (s): s is PhaseSigner & { createdAt: Date } =>
          s.accepted === true && s.createdAt !== null
      )
      .map((s) => ({ at: s.createdAt, weight: s.weight })),
    totalWeight
  );
  if (!acceptCrossing) return null;

  return acceptCrossing.getTime() - preCommitCrossing.getTime();
}

function average(values: number[]) {
  return values.reduce((acc, value) => acc + value, 0) / values.length;
}

/**
 * Average pre-commit latency (seconds) across every explicit pre-commit in the
 * window, or `null` when the window has none.
 */
export function averagePreCommitLatencySeconds(blocks: PhaseBlock[]) {
  const latencies = blocks.flatMap((block) =>
    block.signers
      .map((s) => s.preCommitLatencyMs)
      .filter((ms): ms is number => typeof ms === 'number')
  );
  if (latencies.length === 0) return null;
  return average(latencies) / 1000;
}

/**
 * Average phase gap (seconds) over the blocks in the window that crossed both
 * thresholds. `null` when no block did.
 */
export function averagePhaseGapSeconds(blocks: PhaseBlock[]) {
  const gaps = blocks
    .map((block) =>
      preCommitToAcceptanceGapMs(block.signers, block.totalWeight)
    )
    .filter((gap): gap is number => gap !== null);
  if (gaps.length === 0) return null;
  return average(gaps) / 1000;
}

/**
 * Fraction of blocks in the window for which `signerKey` sent an explicit
 * pre-commit.
 */
export function signerPreCommitRate(blocks: PhaseBlock[], signerKey: string) {
  if (blocks.length === 0) return null;
  const preCommitted = blocks.filter((block) =>
    block.signers.some(
      (s) => s.signing_key === signerKey && typeof s.preCommittedAt === 'string'
    )
  ).length;
  return preCommitted / blocks.length;
}
