import { Gauge } from 'prom-client';
import { recentBlocksHealthCache } from './db/block-proposals';
import { getLatestStackerSet } from './stacks-api';
import { logger } from './logger';
import { stxCommittedCache } from './pox-4';
import { getCreatedAt } from './utils';
import {
  averagePhaseGapSeconds,
  averagePreCommitLatencySeconds,
  signerPreCommitRate,
  type PhaseBlock,
} from './metrics-precommit-calc';
import type { Db } from './db/db';

const acceptanceRateLastBlocks = new Gauge({
  name: 'slot_watch_block_acceptance_rate',
  help: 'The percentage of blocks that were accepted',
  labelNames: ['last_n_blocks'] as const,
});

const averageAcceptanceRateLastBlocks = new Gauge({
  name: 'slot_watch_average_block_acceptance_rate',
  help: 'Average weight accepted per block',
  labelNames: ['last_n_blocks'] as const,
});

const averageTimeToPushedLastBlocks = new Gauge({
  name: 'slot_watch_average_time_to_pushed',
  help: 'Average time (seconds) between BlockProposal and BlockPushed',
  labelNames: ['last_n_blocks'] as const,
});

const signerParticipationRate = new Gauge({
  name: 'slot_watch_signer_participation_rate',
  help: 'The percentage of blocks that a signer participated in',
  labelNames: ['last_n_blocks', 'signer_key'] as const,
});

export const signerDegradationRate = new Gauge({
  name: 'slot_watch_signer_degradation_percent',
  help: 'The percentage of blocks that a signer missed or rejected accepted blocks',
  labelNames: ['signer_key', 'last_n_blocks'] as const,
});

const weightDegradedLastBlocks = new Gauge({
  name: 'slot_watch_percent_weight_degraded',
  help: 'The percentage weight of signers that missed or rejected accepted blocks',
  labelNames: ['last_n_blocks'] as const,
});

const pendingBlockTime = new Gauge({
  name: 'slot_watch_pending_block_proposal',
  help: 'The time (seconds) since the last pending block proposal',
});

const stxCommittedNextCycle = new Gauge({
  name: 'slot_watch_stx_committed_next_cycle',
  help: 'The amount of STX committed to the next cycle',
  labelNames: ['signer_key'] as const,
});

const signingPowerThisCycle = new Gauge({
  name: 'slot_watch_signing_power_this_cycle',
  help: 'The signing power of the current cycle',
  labelNames: ['signer_key'] as const,
});

const averagePreCommitLatency = new Gauge({
  name: 'slot_watch_average_pre_commit_latency',
  help: 'Average time (seconds) between BlockProposal and a signer BlockPreCommit',
  labelNames: ['last_n_blocks'] as const,
});

const preCommitToAcceptanceGap = new Gauge({
  name: 'slot_watch_pre_commit_to_acceptance_gap',
  help: 'Average time (seconds) from crossing the 70% pre-commit weight threshold to crossing the 70% acceptance weight threshold. Blocks that never cross a threshold are excluded',
  labelNames: ['last_n_blocks'] as const,
});

const signerPreCommitParticipation = new Gauge({
  name: 'slot_watch_signer_pre_commit_participation',
  help: 'The percentage of recent proposals a signer sent an explicit BlockPreCommit for. Low values usually indicate an older signer binary that does not emit pre-commits, not misbehavior',
  labelNames: ['last_n_blocks', 'signer_key'] as const,
});

const lastNs = [10, 25, 50];

/**
 * Populates the three pre-commit gauges from data already loaded by
 * `warmupMetrics`. Side-effect-only and free of IO so the caller can swallow
 * any failure: pre-commits are a diagnostic signal, and a bad computation here
 * must never fail the metrics warmup (let alone a user-facing route).
 *
 * Gauges are left unset (rather than set to 0) for windows with no data, so a
 * missing series reads as "no pre-commits observed" instead of "zero latency".
 */
function warmPreCommitMetrics({
  blocks,
  signerKeys,
}: {
  blocks: PhaseBlock[];
  signerKeys: string[];
}) {
  // Reset so that stale signers don't linger between runs.
  signerPreCommitParticipation.reset();

  for (const n of lastNs) {
    const lastNBlocks = blocks.slice(0, n);
    if (lastNBlocks.length === 0) continue;

    const latencySeconds = averagePreCommitLatencySeconds(lastNBlocks);
    if (latencySeconds !== null) {
      averagePreCommitLatency.set({ last_n_blocks: n }, latencySeconds);
    }

    const gapSeconds = averagePhaseGapSeconds(lastNBlocks);
    if (gapSeconds !== null) {
      preCommitToAcceptanceGap.set({ last_n_blocks: n }, gapSeconds);
    }

    for (const signerKey of signerKeys) {
      const rate = signerPreCommitRate(lastNBlocks, signerKey);
      if (rate !== null) {
        signerPreCommitParticipation.set(
          { last_n_blocks: n, signer_key: signerKey },
          rate
        );
      }
    }
  }
}

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: ignored using `--suppress`
export async function warmupMetrics(db: Db) {
  const runStart = Date.now();
  const [recentBlocks, stackerSet, allCommitsResult] = await Promise.all([
    recentBlocksHealthCache.get(db),
    getLatestStackerSet('mainnet'),
    stxCommittedCache.get().catch((error) => {
      logger.error(
        { error: String(error) },
        'Failed to warm STX committed metrics'
      );
      return null;
    }),
  ]);
  const allCommits = allCommitsResult ?? {};

  // Reset so that we don't show stale signers
  signerParticipationRate.reset();
  signerDegradationRate.reset();

  const blocksResolved = recentBlocks.blocks.filter((b) => b.pushedAt !== null);

  const [mostRecent] = recentBlocks.blocks;
  if (mostRecent && mostRecent.accepted === null) {
    const createdAt = getCreatedAt(mostRecent.id);
    pendingBlockTime.set((Date.now() - createdAt.getTime()) / 1000);
  } else {
    pendingBlockTime.set(0);
  }

  for (const n of lastNs) {
    const lastNBlocks = blocksResolved.slice(0, n);
    const acceptedBlocks = lastNBlocks.filter((b) => b.accepted);
    acceptanceRateLastBlocks.set(
      { last_n_blocks: n },
      acceptedBlocks.length / lastNBlocks.length
    );

    const sumWeight = lastNBlocks.reduce((acc, b) => acc + b.totalWeight, 0);
    const sumWeightAccepted = acceptedBlocks.reduce(
      (acc, b) => acc + (b.accepted ? b.weightAccept : 0),
      0
    );
    const sumWeightAcceptedBlocks = acceptedBlocks.reduce(
      (acc, b) => acc + b.totalWeight,
      0
    );
    averageAcceptanceRateLastBlocks.set(
      { last_n_blocks: n },
      sumWeightAccepted / sumWeightAcceptedBlocks
    );

    const blocksWithPush = lastNBlocks.filter(
      (b) => b.pushedAt !== null && b.accepted === true
    );
    let sumTimeToPushed = 0;
    for (const b of blocksWithPush) {
      if (b.pushedAt) {
        const createdAt = getCreatedAt(b.id);
        sumTimeToPushed += b.pushedAt.getTime() - createdAt.getTime();
      }
    }
    averageTimeToPushedLastBlocks.set(
      { last_n_blocks: n },
      sumTimeToPushed / 1000 / blocksWithPush.length
    );

    let sumWeightDegraded = 0;

    // Now get signer participation rates
    for (const signer of stackerSet.signers) {
      let blocksSigned = 0;
      let blocksDegraded = 0;
      for (const block of lastNBlocks) {
        const foundSigner = block.signers.find(
          (s) => s.signing_key === signer.signing_key
        );
        if (!foundSigner) continue;
        if (foundSigner.accepted !== null) {
          blocksSigned++;
        }
        if (foundSigner.accepted === null) {
          blocksDegraded++;
          sumWeightDegraded += signer.weight;
        } else if (foundSigner.accepted === false && block.accepted === true) {
          // Signer rejected an accepted block
          blocksDegraded++;
          sumWeightDegraded += signer.weight;
        }
      }
      signerParticipationRate.set(
        { last_n_blocks: n, signer_key: signer.signing_key },
        blocksSigned / lastNBlocks.length
      );
      const percentageDegraded = blocksDegraded / lastNBlocks.length;
      signerDegradationRate.set(
        { last_n_blocks: n, signer_key: signer.signing_key },
        percentageDegraded
      );
    }
    weightDegradedLastBlocks.set(
      { last_n_blocks: n },
      sumWeightDegraded / sumWeight
    );
  }

  stxCommittedNextCycle.reset();
  for (const [signerKey, stxCommitted] of Object.entries(allCommits)) {
    stxCommittedNextCycle.set({ signer_key: signerKey }, Number(stxCommitted));
  }

  signingPowerThisCycle.reset();
  for (const signer of stackerSet.signers) {
    signingPowerThisCycle.set(
      { signer_key: signer.signing_key },
      signer.weight
    );
  }

  // Isolated: pre-commit gauges are diagnostic. If anything about them throws
  // (missing fields on a stale cache entry, a bad timestamp, a signer set
  // mismatch) we skip just those gauges rather than fail the whole warmup —
  // a failing warmup has previously taken the Worker down with a 1101.
  try {
    warmPreCommitMetrics({
      blocks: blocksResolved,
      signerKeys: stackerSet.signers.map((s) => s.signing_key),
    });
  } catch (error) {
    logger.error(
      { error: String(error) },
      'Failed to warm pre-commit metrics; skipping those gauges'
    );
  }

  const runDuration = Date.now() - runStart;
  logger.info(`Metrics warmed up in ${runDuration}ms`);
}
