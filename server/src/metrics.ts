import { Gauge } from 'prom-client';
import { getRecentBlocksHealth } from './health/health-checks';
import { getStackerSet, getPoxInfo } from './stacks-api';

export const acceptanceRateLastBlocks = new Gauge({
  name: 'slot_watch_block_acceptance_rate',
  help: 'The percentage of blocks that were accepted',
  labelNames: ['last_n_blocks'],
});

export const averageAcceptanceRateLastBlocks = new Gauge({
  name: 'slot_watch_average_block_acceptance_rate',
  help: 'Average weight accepted per block',
  labelNames: ['last_n_blocks'],
});

export const averageTimeToPushedLastBlocks = new Gauge({
  name: 'slot_watch_average_time_to_pushed',
  help: 'Average time (seconds) between BlockProposal and BlockPushed',
  labelNames: ['last_n_blocks'],
});

export const signerParticipationRate = new Gauge({
  name: 'slot_watch_signer_participation_rate',
  help: 'The percentage of blocks that a signer participated in',
  labelNames: ['last_n_blocks', 'signer_key'],
});

let lastRun = 0;
const runEvery = 1000 * 60; // 1 minute
let isRunning = false;

export async function warmupMetrics() {
  if (isRunning) {
    return;
  }
  isRunning = true;
  if (Date.now() - lastRun < runEvery) {
    return;
  }
  isRunning = true;

  console.log('Warming up metrics');
  const recentBlocks = await getRecentBlocksHealth('mainnet');
  const { rewardCycleId } = await getPoxInfo.get('mainnet');
  const stackerSet = await getStackerSet('mainnet', rewardCycleId);

  // Reset so that we don't show stale signers
  signerParticipationRate.reset();

  const lastNs = [10, 25, 50];

  const blocksResolved = recentBlocks.blocks.filter(
    (b) => typeof b.accepted === 'boolean',
  );

  for (const n of lastNs) {
    const lastNBlocks = blocksResolved.slice(0, n);
    const accepted = lastNBlocks.filter((b) => b.accepted).length;
    acceptanceRateLastBlocks.set(
      { last_n_blocks: n },
      accepted / lastNBlocks.length,
    );

    const sumWeightAccepted = lastNBlocks.reduce(
      (acc, b) => acc + (b.accepted ? b.weightAccept : 0),
      0,
    );
    const sumWeight = lastNBlocks.reduce((acc, b) => acc + b.totalWeight, 0);
    averageAcceptanceRateLastBlocks.set(
      { last_n_blocks: n },
      sumWeightAccepted / sumWeight,
    );

    const blocksWithPush = lastNBlocks.filter(
      (b) => b.pushedAt !== null && b.accepted === true,
    );
    let sumTimeToPushed = 0;
    for (const b of blocksWithPush) {
      if (b.pushedAt) {
        sumTimeToPushed += b.pushedAt.getTime() - b.createdAt.getTime();
      }
    }
    averageTimeToPushedLastBlocks.set(
      { last_n_blocks: n },
      sumTimeToPushed / 1000 / blocksWithPush.length,
    );

    // Now get signer participation rates
    for (const signer of stackerSet.signers) {
      let blocksSigned = 0;
      for (const block of lastNBlocks) {
        const foundSigner = block.signers.find(
          (s) => s.signing_key === signer.signing_key,
        );
        if (!foundSigner) continue;
        if (foundSigner.accepted !== null) {
          blocksSigned++;
        }
      }
      signerParticipationRate.set(
        { last_n_blocks: n, signer_key: signer.signing_key },
        blocksSigned / lastNBlocks.length,
      );
    }
  }

  lastRun = Date.now();
  isRunning = false;
}
