import Redis from 'ioredis';
import { logger as _logger } from './logger';
import type { WSPayload } from 'slot-watch-common';

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
  reconnectOnError: (err) => {
    logger.error(
      {
        err,
      },
      'Redis client error - reconnectOnError',
    );
    return true;
  },
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

export async function publishWsEvent(payload: WSPayload) {
  try {
    logger.trace(
      { topic: 'redis', payloadType: payload.type },
      'Publishing event',
    );
    await redisClient.publish(payload.networkKey, JSON.stringify(payload));
  } catch (error) {
    logger.error(
      { topic: 'redis', payloadType: payload.type, err: error },
      `Error publishing event: ${error}`,
    );
  }
}
