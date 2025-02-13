import Redis from 'ioredis';
import { logger as _logger } from './logger';

const logger = _logger.child({
  module: 'redis',
});

const processGroup = process.env.FLY_PROCESS_GROUP;
const isWorker = processGroup === 'worker';

// export const redisClient = createClient({
//   url: process.env.REDIS_URL,
// });

const redisURL = process.env.REDIS_URL ?? 'redis://localhost:6379';

export const redisClient = new Redis(redisURL, {
  maxRetriesPerRequest: isWorker ? null : undefined,
  commandTimeout: 10000,
});
redisClient.on('error', (err) =>
  logger.error(
    {
      err,
    },
    'Redis client error',
  ),
);

export const subClient = redisClient.duplicate();
subClient.on('error', (err) =>
  logger.error(
    {
      err,
    },
    'Redis sub client error',
  ),
);
