import type { F, A } from 'ts-toolbelt';
import { parse, stringify } from 'superjson';
import { logger as _logger } from './logger';
import { env } from 'cloudflare:workers';

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

function ttlKey(key: string) {
  return `${KEY_PREFIX}${key}:ttl`;
}

async function getCache<T>(key: string) {
  const [result, ttl] = await Promise.all([
    env.SLOT_WATCH.get(cacheKey(key)),
    env.SLOT_WATCH.get(ttlKey(key)),
  ]);
  let value: T | null = null;
  if (typeof result === 'string') {
    value = parse<T>(result);
  }
  let ttlValue: number | null = null;
  if (typeof ttl === 'string') {
    ttlValue = Number(ttl);
  }
  return { value, ttl: ttlValue };
}

async function setCache<T>(key: string, value: T, ttl: number) {
  logger.debug(
    {
      key,
      ttl,
    },
    `Cache: setCache ${key}`,
  );
  await Promise.all([
    env.SLOT_WATCH.put(cacheKey(key), stringify(value), {
      expiration: ttl,
    }),
    env.SLOT_WATCH.put(ttlKey(key), ttl.toString(), {
      expiration: ttl,
    }),
  ]);
}

export function memoizeCache<Fn extends F.Function>(
  key: F.Function<F.Parameters<Fn>, string>,
  fn: Fn,
  options: {
    /**
     * The time to live for the cache in seconds
     */
    ttl?: number;
    /**
     * When the cache's TTL is less than this value (in seconds),
     * it will be refreshed
     */
    refreshTtl?: number;
  } = {},
): {
  get: F.Function<F.Parameters<Fn>, A.Promise<F.Return<Fn>>>;
  warm: F.Function<F.Parameters<Fn>, A.Promise<F.Return<Fn>>>;
  clear: F.Function<F.Parameters<Fn>, void>;
} {
  const { ttl = CACHE_TTL, refreshTtl = REFRESH_TTL } = options;
  return {
    async get(...args: F.Parameters<Fn>): A.Promise<F.Return<Fn>> {
      logger.debug(
        {
          key: key(...args),
        },
        `Cache: getCache ${key(...args)}`,
      );
      // const cached = cache.get<F.Return<Fn>>(key(...args));
      const cached = await getCache<F.Return<Fn>>(key(...args));
      if (cached.value) {
        logger.debug(
          {
            key: key(...args),
            ttl: cached.ttl,
          },
          `Cache: hit ${key(...args)}`,
        );
        // process.nextTick(async () => {
        //   if (cached.ttl && cached.ttl < refreshTtl) {
        //     const mutex = new Mutex(ioredisClient, mutexKey(key(...args)), {
        //       lockTimeout: 60 * 1000,
        //       refreshInterval: 0,
        //     });
        //     if (await mutex.tryAcquire()) {
        //       logger.debug(
        //         {
        //           key: key(...args),
        //         },
        //         `Cache: refresh ${key(...args)}`,
        //       );
        //       try {
        //         const result = (await fn(...args)) as F.Return<Fn>;
        //         await setCache(key(...args), result, ttl);
        //       } catch (error) {
        //         await mutex.release();
        //       }
        //     }
        //   }
        // });
        return cached.value;
      }
      logger.debug(
        {
          key: key(...args),
        },
        `Cache: miss ${key(...args)}`,
      );
      const result = (await fn(...args)) as F.Return<Fn>;
      // cache.set<F.Return<Fn>>(key(...args), result);
      await setCache(key(...args), result, ttl);
      return result as unknown as A.Promise<F.Return<Fn>>;
    },
    async warm(...args: F.Parameters<Fn>): A.Promise<F.Return<Fn>> {
      logger.debug(
        {
          key: key(...args),
        },
        `Cache: warm ${key(...args)}`,
      );
      const result = await fn(...args);
      await setCache(key(...args), result, ttl);
      return result;
    },
    async clear(...args: F.Parameters<Fn>) {
      logger.debug(
        {
          key: key(...args),
        },
        `Cache: clear ${key(...args)}`,
      );
      await env.SLOT_WATCH.delete(cacheKey(key(...args)));
      await env.SLOT_WATCH.delete(ttlKey(key(...args)));
    },
  };
}
