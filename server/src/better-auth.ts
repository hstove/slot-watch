import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { cors } from 'hono/cors';
import type { Handler, MiddlewareHandler } from 'hono';
import { env } from 'cloudflare:workers';
import type { Db } from './db/db';
import { authSchema } from './db/schema';
import type { ServerType } from './server-context';

/** better-auth's handler is mounted here (its default `basePath`). */
export const AUTH_BASE_PATH = '/api/auth';

/** Frontends allowed to make credentialed requests and receive redirects. */
const trustedOrigins = ['https://slotwatch.dev', 'https://slotwatch.localhost'];

/**
 * Auth is only on when its secrets are configured. Previews never get them
 * (their database is read-only), so auth routes there return 503.
 */
export function isAuthConfigured() {
  return Boolean(
    env.BETTER_AUTH_SECRET && env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET
  );
}

/**
 * Builds a better-auth instance bound to this request's DB client (the Worker
 * opens one Postgres connection per request).
 */
export function makeAuth(db: Db, baseURL: string) {
  return betterAuth({
    baseURL,
    basePath: AUTH_BASE_PATH,
    secret: env.BETTER_AUTH_SECRET,
    database: drizzleAdapter(db, { provider: 'pg', schema: authSchema }),
    trustedOrigins,
    socialProviders: {
      google: {
        clientId: env.GOOGLE_CLIENT_ID ?? '',
        clientSecret: env.GOOGLE_CLIENT_SECRET ?? '',
      },
    },
    telemetry: { enabled: false },
    advanced: {
      ipAddress: { ipAddressHeaders: ['cf-connecting-ip'] },
      // The client (slotwatch.dev, or slotwatch.localhost in dev) calls the
      // API cross-origin with `credentials: 'include'`. `SameSite=None` lets
      // the session cookie ride along from local dev too; better-auth's
      // Origin check against `trustedOrigins` guards mutating requests.
      defaultCookieAttributes: {
        sameSite: 'none',
        secure: true,
      },
    },
  });
}

export type Auth = ReturnType<typeof makeAuth>;

/** Credentialed CORS for the auth routes; the rest of the API stays `*`. */
export const authCors = cors({
  origin: trustedOrigins,
  credentials: true,
  allowHeaders: ['Content-Type', 'Authorization'],
  allowMethods: ['GET', 'POST', 'OPTIONS'],
  maxAge: 600,
});

const publicCors = cors();

export const apiCors: MiddlewareHandler<ServerType> = (c, next) =>
  c.req.path.startsWith(`${AUTH_BASE_PATH}/`)
    ? authCors(c, next)
    : publicCors(c, next);

/** Handles every better-auth endpoint under `AUTH_BASE_PATH`. */
export const authHandler: Handler<ServerType> = (c) => {
  if (!isAuthConfigured()) {
    return c.json({ error: 'Authentication is not configured' }, 503);
  }
  const auth = makeAuth(c.get('db'), new URL(c.req.url).origin);
  return auth.handler(c.req.raw);
};
