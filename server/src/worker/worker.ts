import { redisClient } from '../redis';
import { Worker } from 'bullmq';
import { QUEUE_NAME, type WorkerJob } from './types';
import { logger as _logger } from '../logger';
import {
  BURN_BLOCKS_EVENT,
  CHUNKS_EVENT,
  MANY_CHUNKS_EVENT,
  NEW_BLOCK_EVENT,
} from 'slot-watch-common';
import { warmCache } from '../stacks-api';
import {
  handleBurnBlockEvent,
  handleStacksBlockEvent,
} from '../events/block-events';
import { handleStackerDBChunk } from '../events/stackerdb';

const logger = _logger.child({ module: 'worker' });

export const workerQueue = new Worker<WorkerJob>(
  QUEUE_NAME,
  async (job) => {
    if (job.data.type === BURN_BLOCKS_EVENT) {
      await warmCache(job.data.networkKey);
      await handleBurnBlockEvent(job.data);
    } else if (job.data.type === NEW_BLOCK_EVENT) {
      await handleStacksBlockEvent(job.data);
    } else if (job.data.type === MANY_CHUNKS_EVENT) {
      await handleStackerDBChunk(
        job.data.payload,
        new Date(job.data.receivedAt),
        job.data.networkKey,
      );
    }
  },
  {
    connection: redisClient,
    concurrency: 15,
  },
);

workerQueue.on('completed', (job) => {
  logger.debug(`Job ${job.name} completed (${job.data.networkKey})`);
});

workerQueue.on('failed', (job, err) => {
  logger.error(`Job ${job?.name} failed (${job?.data.networkKey}): ${err}`);
});
