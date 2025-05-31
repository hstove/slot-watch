import { Gauge, Summary } from 'prom-client';
import { getRecentBlocksHealth } from './db/block-proposals';
import { getStackerSet, getPoxInfo } from './stacks-api';
import { logger } from './logger';
import { stxCommittedCache } from './pox-4';
import { getCreatedAt } from './utils';
// import { workerQueue } from './worker/queue';

export const acceptanceRateLastBlocks = new Gauge({
  name: 'slot_watch_block_acceptance_rate',
  help: 'The percentage of blocks that were accepted',
  labelNames: ['last_n_blocks'] as const,
});

export const averageAcceptanceRateLastBlocks = new Gauge({
  name: 'slot_watch_average_block_acceptance_rate',
  help: 'Average weight accepted per block',
  labelNames: ['last_n_blocks'] as const,
});

export const averageTimeToPushedLastBlocks = new Gauge({
  name: 'slot_watch_average_time_to_pushed',
  help: 'Average time (seconds) between BlockProposal and BlockPushed',
  labelNames: ['last_n_blocks'] as const,
});

export const signerParticipationRate = new Gauge({
  name: 'slot_watch_signer_participation_rate',
  help: 'The percentage of blocks that a signer participated in',
  labelNames: ['last_n_blocks', 'signer_key'] as const,
});

export const signerDegradationRate = new Gauge({
  name: 'slot_watch_signer_degradation_percent',
  help: 'The percentage of blocks that a signer missed or rejected accepted blocks',
  labelNames: ['signer_key', 'last_n_blocks'] as const,
});

export const weightDegradedLastBlocks = new Gauge({
  name: 'slot_watch_percent_weight_degraded',
  help: 'The percentage weight of signers that missed or rejected accepted blocks',
  labelNames: ['last_n_blocks'] as const,
});

export const pendingBlockTime = new Gauge({
  name: 'slot_watch_pending_block_proposal',
  help: 'The time (seconds) since the last pending block proposal',
});

export const stxCommittedNextCycle = new Gauge({
  name: 'slot_watch_stx_committed_next_cycle',
  help: 'The amount of STX committed to the next cycle',
  labelNames: ['signer_key'] as const,
});

export const signingPowerThisCycle = new Gauge({
  name: 'slot_watch_signing_power_this_cycle',
  help: 'The signing power of the current cycle',
  labelNames: ['signer_key'] as const,
});

export const workerJobsCounts = new Gauge({
  name: 'slot_watch_worker_job_count',
  help: 'The amount of worker jobs',
  labelNames: ['status'] as const,
});

export const stackerDbChunkProcessingTimeSummary = new Summary({
  name: 'slot_watch_stackerdb_chunk_processing_time',
  help: 'The time (seconds) it takes to process a chunk',
  labelNames: ['chunk_type'] as const,
});

export const workerJobProcessingTimeSummary = new Summary({
  name: 'slot_watch_worker_job_processing_time',
  help: 'The time (seconds) it takes to process a worker job',
  labelNames: ['job_type'] as const,
});

let lastRun = 0;
const runEvery = 1000 * 60; // 1 minute
let isRunning = false;

export const lastNs = [10, 25, 50];

export async function warmupMetrics() {
  if (isRunning) {
    logger.debug('Metrics are already running');
    return;
  }
  if (Date.now() - lastRun < runEvery) {
    logger.debug('Metrics were last run less than a minute ago');
    return;
  }
  const runStart = Date.now();
  isRunning = true;

  logger.info('Warming up metrics');
  const recentBlocks = await getRecentBlocksHealth({ networkKey: 'mainnet' });
  const { rewardCycleId } = await getPoxInfo.get('mainnet');
  const stackerSet = await getStackerSet('mainnet', rewardCycleId);

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
      acceptedBlocks.length / lastNBlocks.length,
    );

    const sumWeight = lastNBlocks.reduce((acc, b) => acc + b.totalWeight, 0);
    const sumWeightAccepted = acceptedBlocks.reduce(
      (acc, b) => acc + (b.accepted ? b.weightAccept : 0),
      0,
    );
    const sumWeightAcceptedBlocks = acceptedBlocks.reduce(
      (acc, b) => acc + b.totalWeight,
      0,
    );
    averageAcceptanceRateLastBlocks.set(
      { last_n_blocks: n },
      sumWeightAccepted / sumWeightAcceptedBlocks,
    );

    const blocksWithPush = lastNBlocks.filter(
      (b) => b.pushedAt !== null && b.accepted === true,
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
      sumTimeToPushed / 1000 / blocksWithPush.length,
    );

    let sumWeightDegraded = 0;

    // Now get signer participation rates
    for (const signer of stackerSet.signers) {
      let blocksSigned = 0;
      let blocksDegraded = 0;
      for (const block of lastNBlocks) {
        const foundSigner = block.signers.find(
          (s) => s.signing_key === signer.signing_key,
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
        blocksSigned / lastNBlocks.length,
      );
      const percentageDegraded = blocksDegraded / lastNBlocks.length;
      signerDegradationRate.set(
        { last_n_blocks: n, signer_key: signer.signing_key },
        percentageDegraded,
      );
    }
    weightDegradedLastBlocks.set(
      { last_n_blocks: n },
      sumWeightDegraded / sumWeight,
    );
  }

  const allCommits = await stxCommittedCache.get();
  stxCommittedNextCycle.reset();
  for (const [signerKey, stxCommitted] of Object.entries(allCommits)) {
    stxCommittedNextCycle.set({ signer_key: signerKey }, Number(stxCommitted));
  }

  signingPowerThisCycle.reset();
  for (const signer of stackerSet.signers) {
    signingPowerThisCycle.set(
      { signer_key: signer.signing_key },
      signer.weight,
    );
  }

  // const workerCounts = await workerQueue.getJobCounts();
  // for (const [status, count] of Object.entries(workerCounts)) {
  //   workerJobsCounts.set({ status }, Number(count));
  // }

  const runDuration = Date.now() - runStart;
  logger.info(`Metrics warmed up in ${runDuration}ms`);
  lastRun = Date.now();
  isRunning = false;
}
