import { Queue } from 'bullmq';
import { redisURL } from '../redis';
import { QUEUE_NAME, type WorkerJob } from './types';

export const workerQueue = new Queue<WorkerJob>(QUEUE_NAME, {
  connection: {
    url: redisURL,
  },
  defaultJobOptions: {
    removeOnComplete: true,
    removeOnFail: true,
  },
});
