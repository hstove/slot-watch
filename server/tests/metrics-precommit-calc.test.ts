import { describe, expect, test } from 'bun:test';
import {
  averagePhaseGapSeconds,
  averagePreCommitLatencySeconds,
  preCommitToAcceptanceGapMs,
  signerPreCommitRate,
  weightThreshold,
  type PhaseBlock,
  type PhaseSigner,
} from '../src/metrics-precommit-calc';

/**
 * Covers the pure aggregation behind the pre-commit gauges. The interesting
 * property is the 70%-of-weight crossing: it must be weight-driven (not
 * count-driven) and must return null rather than 0 when a phase never crosses,
 * so a stuck block is excluded from averages instead of dragging them down.
 */

const T0 = new Date('2026-08-05T00:00:00.000Z').getTime();

function at(offsetMs: number) {
  return new Date(T0 + offsetMs);
}

function signer({
  key,
  weight,
  preCommitMs,
  acceptMs,
  accepted = true,
  latencyMs,
}: {
  key: string;
  weight: number;
  preCommitMs?: number;
  acceptMs?: number;
  accepted?: boolean | null;
  latencyMs?: number;
}): PhaseSigner {
  return {
    signing_key: key,
    weight,
    createdAt: typeof acceptMs === 'number' ? at(acceptMs) : null,
    accepted: typeof acceptMs === 'number' ? accepted : null,
    preCommittedAt:
      typeof preCommitMs === 'number' ? at(preCommitMs).toISOString() : null,
    preCommitLatencyMs: latencyMs ?? null,
  };
}

describe('weightThreshold', () => {
  test('is ceil(total * 7/10), the same bar signers use', () => {
    // Real mainnet cycle-140 total weight.
    expect(weightThreshold(3712)).toBe(2599);
    // Rounds up, never down: 7 of 10 exactly, 8 of 11.
    expect(weightThreshold(10)).toBe(7);
    expect(weightThreshold(11)).toBe(8);
  });
});

describe('preCommitToAcceptanceGapMs', () => {
  test('measures from the weight-crossing pre-commit to the crossing accept', () => {
    // Total 100, threshold 70. Weight crosses on the third signer of each phase.
    const signers = [
      signer({ key: 'a', weight: 30, preCommitMs: 1000, acceptMs: 5000 }),
      signer({ key: 'b', weight: 30, preCommitMs: 2000, acceptMs: 6000 }),
      signer({ key: 'c', weight: 30, preCommitMs: 3000, acceptMs: 7000 }),
      signer({ key: 'd', weight: 10, preCommitMs: 4000, acceptMs: 8000 }),
    ];
    // 30+30+30 = 90 >= 70 at t=3000 (pre-commit) and t=7000 (accept).
    expect(preCommitToAcceptanceGapMs(signers, 100)).toBe(4000);
  });

  test('is weight-driven, not count-driven', () => {
    // One 80-weight signer crosses the bar alone, immediately.
    const signers = [
      signer({ key: 'whale', weight: 80, preCommitMs: 500, acceptMs: 2500 }),
      signer({ key: 'small', weight: 20, preCommitMs: 100, acceptMs: 200 }),
    ];
    // 'small' (20) alone is under 70, so the crossing is 'whale'.
    expect(preCommitToAcceptanceGapMs(signers, 100)).toBe(2000);
  });

  test('walks signers in observation order, not array order', () => {
    const signers = [
      signer({ key: 'late', weight: 40, preCommitMs: 9000, acceptMs: 9500 }),
      signer({ key: 'early', weight: 40, preCommitMs: 1000, acceptMs: 1500 }),
    ];
    // 40+40 = 80 >= 70; crossing is the later of the two in each phase.
    expect(preCommitToAcceptanceGapMs(signers, 100)).toBe(500);
  });

  test('drops unparseable timestamps instead of corrupting the sort', () => {
    // A garbage `preCommittedAt` can reach us from a stale KV cache entry.
    const signers: PhaseSigner[] = [
      { ...signer({ key: 'bad', weight: 60 }), preCommittedAt: 'not-a-date' },
      signer({ key: 'a', weight: 40, preCommitMs: 1000, acceptMs: 2000 }),
      signer({ key: 'b', weight: 40, preCommitMs: 2000, acceptMs: 3000 }),
    ];
    // 'bad' contributes no weight, so 40+40 crosses 70 at t=2000 / t=3000.
    expect(preCommitToAcceptanceGapMs(signers, 100)).toBe(1000);
  });

  test('returns null when the pre-commit phase never reaches 70%', () => {
    // Only 40 of 100 weight pre-committed — eg most signers on an old binary.
    const signers = [
      signer({ key: 'a', weight: 40, preCommitMs: 1000, acceptMs: 2000 }),
      signer({ key: 'b', weight: 60, acceptMs: 2500 }),
    ];
    expect(preCommitToAcceptanceGapMs(signers, 100)).toBeNull();
  });

  test('returns null when the acceptance phase never reaches 70%', () => {
    // Pre-commits crossed, but the block was then rejected/stalled.
    const signers = [
      signer({ key: 'a', weight: 40, preCommitMs: 1000, acceptMs: 2000 }),
      signer({ key: 'b', weight: 40, preCommitMs: 1500 }),
      signer({
        key: 'c',
        weight: 20,
        preCommitMs: 1600,
        acceptMs: 3000,
        accepted: false,
      }),
    ];
    expect(preCommitToAcceptanceGapMs(signers, 100)).toBeNull();
  });

  test('ignores rejections when accumulating acceptance weight', () => {
    const signers = [
      signer({ key: 'a', weight: 40, preCommitMs: 1000, acceptMs: 2000 }),
      signer({
        key: 'rejector',
        weight: 20,
        preCommitMs: 1100,
        acceptMs: 2100,
        accepted: false,
      }),
      signer({ key: 'c', weight: 40, preCommitMs: 1200, acceptMs: 5000 }),
    ];
    // Total 100, threshold 70.
    // Pre-commit weight: 40 + 20 + 40 crosses 70 on 'c' at t=1200.
    // Accept weight skips the rejector: 40 (a) + 40 (c) crosses at t=5000.
    // A count-based tally would have crossed earlier, at the rejector.
    expect(preCommitToAcceptanceGapMs(signers, 100)).toBe(3800);
  });
});

describe('window aggregates', () => {
  function block(gapSpec: {
    preCommitMs?: number;
    acceptMs?: number;
    latencies?: number[];
  }): PhaseBlock {
    const { preCommitMs, acceptMs, latencies = [] } = gapSpec;
    return {
      totalWeight: 100,
      signers: [
        signer({
          key: 'a',
          weight: 80,
          preCommitMs,
          acceptMs,
          latencyMs: latencies[0],
        }),
        signer({ key: 'b', weight: 20, latencyMs: latencies[1] }),
      ],
    };
  }

  test('averagePhaseGapSeconds excludes blocks that never crossed', () => {
    const blocks = [
      block({ preCommitMs: 0, acceptMs: 2000 }), // 2s
      block({ preCommitMs: 0, acceptMs: 4000 }), // 4s
      block({ preCommitMs: 0 }), // never accepted -> excluded
    ];
    expect(averagePhaseGapSeconds(blocks)).toBe(3);
  });

  test('averagePhaseGapSeconds is null when no block crossed both phases', () => {
    expect(averagePhaseGapSeconds([block({ preCommitMs: 0 })])).toBeNull();
  });

  test('averagePreCommitLatencySeconds averages over pre-commits, not blocks', () => {
    const blocks = [
      block({ preCommitMs: 0, acceptMs: 1000, latencies: [2000, 4000] }),
      block({ preCommitMs: 0, acceptMs: 1000, latencies: [6000] }),
    ];
    // (2000 + 4000 + 6000) / 3 = 4000ms
    expect(averagePreCommitLatencySeconds(blocks)).toBe(4);
  });

  test('averagePreCommitLatencySeconds is null with no pre-commit latencies', () => {
    expect(averagePreCommitLatencySeconds([block({})])).toBeNull();
  });

  test('signerPreCommitRate counts blocks with an explicit pre-commit', () => {
    const blocks = [
      block({ preCommitMs: 0, acceptMs: 1000 }),
      block({ preCommitMs: 0, acceptMs: 1000 }),
      block({ acceptMs: 1000 }),
      block({ acceptMs: 1000 }),
    ];
    expect(signerPreCommitRate(blocks, 'a')).toBe(0.5);
    // Signer 'b' never pre-commits — the old-binary case, reported as 0.
    expect(signerPreCommitRate(blocks, 'b')).toBe(0);
  });

  test('signerPreCommitRate is null for an empty window', () => {
    expect(signerPreCommitRate([], 'a')).toBeNull();
  });
});
