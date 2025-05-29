import pino from 'pino';
import type { Logger } from 'pino';
import type { MiddlewareHandler } from 'hono';

import { getPath } from 'hono/utils/url';

export let logger: Logger;

if (process.env.NODE_ENV === 'production') {
  logger = pino({
    level: 'debug',
    formatters: {
      level: (label) => {
        return { level: label };
      },
    },
    mixin() {
      return {
        fly_process_group: process.env.FLY_PROCESS_GROUP,
      };
    },
  });
} else {
  logger = pino({
    level: 'info',
    transport: {
      target: 'pino-pretty',
    },
  });
}

export const honoLogger: MiddlewareHandler = async (c, next) => {
  const path = getPath(c.req.raw);
  const method = c.req.method;
  const requestId = c.get('requestId');

  logger.debug(
    {
      requestId,
      path,
      method,
    },
    'Request received',
  );

  const start = Date.now();

  await next();

  const duration = Date.now() - start;

  logger.debug(
    {
      requestId,
      path,
      method,
      duration,
      durationHumanized: time(duration),
    },
    'Request completed',
  );
};

function time(delta: number): string {
  return delta < 1000 ? `${delta}ms` : `${Math.round(delta / 1000)}s`;
}
