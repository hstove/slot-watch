import type { F, A } from 'ts-toolbelt';
import { parse, stringify } from 'superjson';
import { log } from './logger';
import { env } from 'cloudflare:workers';

const logger = log.child().withContext({
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
    env.CACHE.get(cacheKey(key)),
    env.CACHE.get(ttlKey(key)),
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
  logger
    .withMetadata({
      key,
      ttl,
    })
    .debug(`Cache: setCache ${key}`);
  await Promise.all([
    env.CACHE.put(cacheKey(key), stringify(value), {
      expirationTtl: ttl,
    }),
    // env.CACHE.put(ttlKey(key), ttl.toString(), {
    //   expirationTtl: ttl,
    // }),
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
  getExpiration: F.Function<F.Parameters<Fn>, A.Promise<number | undefined>>;
  warmIfNeeded: F.Function<F.Parameters<Fn>, Promise<void>>;
} {
  const { ttl = CACHE_TTL, refreshTtl = REFRESH_TTL } = options;
  return {
    async get(...args: F.Parameters<Fn>): A.Promise<F.Return<Fn>> {
      logger
        .withMetadata({
          key: key(...args),
        })
        .debug(`Cache: getCache ${key(...args)}`);
      const cached = await getCache<F.Return<Fn>>(key(...args));
      if (cached.value) {
        logger
          .withMetadata({
            key: key(...args),
            ttl: cached.ttl,
          })
          .debug(`Cache: hit ${key(...args)}`);
        return cached.value;
      }
      logger
        .withMetadata({
          key: key(...args),
        })
        .debug(`Cache: miss ${key(...args)}`);
      const result = (await fn(...args)) as F.Return<Fn>;
      await setCache(key(...args), result, ttl);
      return result as unknown as A.Promise<F.Return<Fn>>;
    },
    async warm(...args: F.Parameters<Fn>): A.Promise<F.Return<Fn>> {
      logger
        .withMetadata({
          key: key(...args),
        })
        .debug(`Cache: warm ${key(...args)}`);
      const result = await fn(...args);
      await setCache(key(...args), result, ttl);
      return result;
    },
    async clear(...args: F.Parameters<Fn>) {
      logger
        .withMetadata({
          key: key(...args),
        })
        .debug(`Cache: clear ${key(...args)}`);
      await env.CACHE.delete(cacheKey(key(...args)));
      await env.CACHE.delete(ttlKey(key(...args)));
    },
    async getExpiration(
      ...args: F.Parameters<Fn>
    ): A.Promise<number | undefined> {
      const keyFn = key(...args);
      const keysResult = await env.CACHE.list({
        prefix: keyFn,
      });
      for (const key of keysResult.keys) {
        if (key.name === keyFn) {
          return key.expiration;
        }
      }
      return undefined;
    },
    async warmIfNeeded(...args: F.Parameters<Fn>): Promise<void> {
      const expiration = await this.getExpiration(...args);
      if (typeof expiration !== 'number') {
        await this.warm(...args);
        return;
      }
      const expRemaining = expiration - Date.now();
      if (expRemaining / 1000 < refreshTtl) {
        await this.warm(...args);
      }
    },
  };
}
