import type { F, A } from 'ts-toolbelt';
import { redisClient } from './redis';
import { parse, stringify } from 'superjson';
import { logger } from './logger';

const CACHE_TTL = 60 * 10;

const KEY_PREFIX = 'slot-watch-cache:';

function cacheKey(key: string) {
  return `${KEY_PREFIX}${key}`;
}

async function getCache<T>(key: string) {
  const result = await redisClient.get(cacheKey(key));
  if (result) {
    return parse<T>(result);
  }
  return null;
}

async function setCache<T>(key: string, value: T) {
  await redisClient.set(cacheKey(key), stringify(value), { EX: CACHE_TTL });
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
    async get(...args: F.Parameters<Fn>) {
      logger.debug('Cache: getCache', key(...args));
      // const cached = cache.get<F.Return<Fn>>(key(...args));
      const cached = await getCache<F.Return<Fn>>(key(...args));
      if (cached) {
        logger.debug('Cache: hit', key(...args));
        return cached;
      }
      logger.debug('Cache: miss', key(...args));
      const result = await fn(...args);
      // cache.set<F.Return<Fn>>(key(...args), result);
      await setCache(key(...args), result);
      return result;
    },
    async warm(...args: F.Parameters<Fn>) {
      logger.debug('Cache: warm', key(...args));
      const result = await fn(...args);
      // cache.set<F.Return<Fn>>(key(...args), result);
      await setCache(key(...args), result);
      return result;
    },
    async clear(...args: F.Parameters<Fn>) {
      logger.debug('Cache: clear', key(...args));
      // cache.del(key(...args));
      await redisClient.del(key(...args));
    },
  };
}
