import { Queue } from 'bullmq';
import { redisClient } from '../redis';
import { QUEUE_NAME, type WorkerJob } from './types';

export const workerQueue = new Queue<WorkerJob>(QUEUE_NAME, {
  connection: redisClient,
});
