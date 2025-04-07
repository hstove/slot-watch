import type { F, A } from 'ts-toolbelt';
import { redisClient, ioredisClient } from './redis';
import { parse, stringify } from 'superjson';
import { logger as _logger } from './logger';
import { Mutex } from 'redis-semaphore';

const logger = _logger.child({
  module: 'cache',
});

const CACHE_TTL = 60 * 10;
const REFRESH_TTL = 60 * 5;

const KEY_PREFIX = 'slot-watch-cache:';

function cacheKey(key: string) {
  return `${KEY_PREFIX}${key}`;
}

function mutexKey(key: string) {
  return `${KEY_PREFIX}${key}:mutex`;
}

async function getCache<T>(key: string) {
  // const pipeline = redisClient.pipeline();
  // pipeline.get(cacheKey(key));
  // pipeline.ttl(cacheKey(key));
  // const outcome = await pipeline.exec();
  // if (outcome === null) {
  //   throw new Error('Cache error');
  // }
  // const [valueResult, ttlResult] = outcome;
  // // biome-ignore lint/style/noNonNullAssertion: <explanation>
  // const [valueError, valueStr] = valueResult!;
  // // biome-ignore lint/style/noNonNullAssertion: <explanation>
  // const [ttlError, ttl] = ttlResult!;
  // if (valueError) {
  //   throw new Error(`Cache error: ${valueError.message}`);
  // }
  // if (ttlError) {
  //   throw new Error(`Cache error: ${ttlError.message}`);
  // }
  // if (typeof ttl !== 'number') {
  //   throw new Error('Cache error: TTL is not a number');
  // }
  console.log(key);
  const [result, ttl] = await Promise.all([
    redisClient.get(cacheKey(key)),
    redisClient.ttl(cacheKey(key)),
  ]);
  let value: T | null = null;
  if (typeof result === 'string') {
    value = parse<T>(result);
  }
  return { value, ttl };
}

async function setCache<T>(key: string, value: T) {
  // await redisClient.set(cacheKey(key), stringify(value), 'EX', CACHE_TTL);
  await redisClient.set(cacheKey(key), stringify(value), {
    EX: CACHE_TTL,
  });
}

export function memoizeCache<Fn extends F.Function>(
  key: F.Function<F.Parameters<Fn>, string>,
  fn: Fn,
): {
  get: F.Function<F.Parameters<Fn>, A.Promise<F.Return<Fn>>>;
  warm: F.Function<F.Parameters<Fn>, A.Promise<F.Return<Fn>>>;
  clear: F.Function<F.Parameters<Fn>, void>;
} {
  return {
    async get(...args: F.Parameters<Fn>): A.Promise<F.Return<Fn>> {
      logger.debug(
        {
          key: key(...args),
        },
        'Cache: getCache',
      );
      // const cached = cache.get<F.Return<Fn>>(key(...args));
      const cached = await getCache<F.Return<Fn>>(key(...args));
      if (cached.value) {
        logger.debug(
          {
            key: key(...args),
            ttl: cached.ttl,
          },
          'Cache: hit',
        );
        process.nextTick(async () => {
          if (cached.ttl < REFRESH_TTL) {
            const mutex = new Mutex(ioredisClient, mutexKey(key(...args)), {
              lockTimeout: 60 * 1000,
              refreshInterval: 0,
            });
            if (await mutex.tryAcquire()) {
              logger.debug(
                {
                  key: key(...args),
                },
                'Cache: refresh',
              );
              try {
                const result = (await fn(...args)) as F.Return<Fn>;
                await setCache(key(...args), result);
              } catch (error) {
                await mutex.release();
              }
            }
          }
        });
        return cached.value;
      }
      logger.debug(
        {
          key: key(...args),
        },
        'Cache: miss',
      );
      const result = (await fn(...args)) as F.Return<Fn>;
      // cache.set<F.Return<Fn>>(key(...args), result);
      await setCache(key(...args), result);
      return result as unknown as A.Promise<F.Return<Fn>>;
    },
    async warm(...args: F.Parameters<Fn>): A.Promise<F.Return<Fn>> {
      logger.debug(
        {
          key: key(...args),
        },
        'Cache: warm',
      );
      const result = await fn(...args);
      await setCache(key(...args), result);
      return result;
    },
    async clear(...args: F.Parameters<Fn>) {
      logger.debug(
        {
          key: key(...args),
        },
        'Cache: clear',
      );
      await redisClient.del(key(...args));
    },
  };
}
