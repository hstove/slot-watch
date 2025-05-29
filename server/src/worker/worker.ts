import { redisURL } from '../redis';
import { Worker } from 'bullmq';
import { QUEUE_NAME, type WorkerJob, type WorkerResult } from './types';
import { logger as _logger } from '../logger';
import {
  BURN_BLOCKS_EVENT,
  chunkTypeName,
  MANY_CHUNKS_EVENT,
  NEW_BLOCK_EVENT,
} from 'slot-watch-common';
import { warmCache } from '../stacks-api';
import {
  handleBurnBlockEvent,
  handleStacksBlockEvent,
} from '../events/block-events';
import { handleStackerDBChunk } from '../events/stackerdb';
import { workerJobProcessingTimeSummary } from '../metrics';
import { hex } from '@scure/base';

const logger = _logger.child({ module: 'worker' });

export const workerQueue = new Worker<WorkerJob, WorkerResult>(
  QUEUE_NAME,
  async (job) => {
    const start = Date.now();
    if (job.data.type === BURN_BLOCKS_EVENT) {
      await handleBurnBlockEvent(job.data);
      await warmCache(job.data.networkKey);
    } else if (job.data.type === NEW_BLOCK_EVENT) {
      await handleStacksBlockEvent(job.data);
    } else if (job.data.type === MANY_CHUNKS_EVENT) {
      await handleStackerDBChunk(
        job.data.payload,
        new Date(job.data.receivedAt),
        job.data.networkKey,
      );
    }
    return {
      timeSecs: (Date.now() - start) / 1000,
    };
  },
  {
    connection: {
      url: redisURL,
    },
    concurrency: 15,
  },
);

workerQueue.on('ready', () => {
  logger.info('Worker ready');
});

workerQueue.on('completed', (job, result) => {
  if (job.data.type === MANY_CHUNKS_EVENT) {
    const [slot] = job.data.payload.modified_slots;
    if (slot) {
      const chunkType = chunkTypeName(hex.decode(slot.data));
      logger.debug(
        {
          chunkType,
          module: 'worker',
          event: 'completed',
          timeSecs: result.timeSecs,
        },
        `New chunks (${chunkType}) processed in ${result.timeSecs.toFixed(2)}s`,
      );
    }
  } else {
    logger.debug(`Job ${job.name} completed (${job.data.networkKey})`);
  }
});

workerQueue.on('failed', (job, err) => {
  logger.error(
    {
      backtrace: err?.stack,
      err,
    },
    `Job ${job?.name} failed (${job?.data.networkKey}): ${err}`,
  );
});
