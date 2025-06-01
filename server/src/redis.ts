import { logger as _logger } from './logger';
import type { WSPayload } from 'slot-watch-common';
import { Redis } from '@upstash/redis/cloudflare';
import { env } from 'cloudflare:workers';

const logger = _logger.child({
  module: 'redis',
});

export const redis = new Redis({
  url: env.UPSTASH_REDIS_REST_URL,
  token: env.UPSTASH_REDIS_REST_TOKEN,
});

const processGroup = process.env.FLY_PROCESS_GROUP;
const isWorker = processGroup === 'worker';

export const redisURL = process.env.REDIS_URL ?? 'redis://localhost:6379';

// export const ioredisClient = new Redis(redisURL, {
//   maxRetriesPerRequest: isWorker ? null : undefined,
//   commandTimeout: 20000,
//   reconnectOnError: (err) => {
//     logger.error(
//       {
//         err,
//       },
//       'Redis client error - reconnectOnError',
//     );
//     return true;
//   },
// });
// export const redisClient = createClient({
//   url: redisURL,
// });
// // await redisClient.connect();

// redisClient.on('error', (err) =>
//   logger.error(
//     {
//       err,
//     },
//     'Redis client error',
//   ),
// );

// redisClient.on('reconnecting', () => {
//   logger.info('Redis client reconnecting');
// });

// export const subClient = redisClient.duplicate();
// subClient.on('error', (err) =>
//   logger.error(
//     {
//       err,
//     },
//     'Redis sub client error',
//   ),
// );

// await subClient.connect();

export async function publishWsEvent(payload: WSPayload) {
  try {
    logger.trace(
      { topic: 'redis', payloadType: payload.type },
      'Publishing event',
    );
    await redis.publish(payload.networkKey, JSON.stringify(payload));
  } catch (error) {
    logger.error(
      { topic: 'redis', payloadType: payload.type, err: error },
      `Error publishing event: ${error}`,
    );
  }
}
