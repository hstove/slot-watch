import type { MiddlewareHandler } from 'hono';
import { LogLayer, ConsoleTransport, type LogLevelType } from 'loglayer';
import { getPath } from 'hono/utils/url';

export const log = new LogLayer({
  transport: new ConsoleTransport({
    logger: console,
  }),
});

const logWrapperFn = (level: LogLevelType) => {
  function innerLog(metadata: Record<string, unknown>, msg: string): void;
  function innerLog(msg: string): void;
  function innerLog(...args: unknown[]): void {
    if (args.length === 2) {
      log
        .withMetadata(args[0] as Record<string, unknown>)
        [level](args[1] as string);
    } else {
      log[level](args[0] as string);
    }
  }
  return innerLog;
};

const _log = {
  trace: logWrapperFn('trace'),
  debug: logWrapperFn('debug'),
  info: logWrapperFn('info'),
  warn: logWrapperFn('warn'),
  error: logWrapperFn('error'),
  fatal: logWrapperFn('fatal'),
};

export const logger = _log;

// export let logger: Logger;

// if (process.env.NODE_ENV === 'development') {
//   logger = pino({
//     level: 'info',
//     transport: {
//       target: 'pino-pretty',
//     },
//   });
// } else {
//   logger = pino({
//     level: 'debug',
//     formatters: {
//       level: (label) => {
//         return { level: label };
//       },
//     },
//     mixin() {
//       return {
//         fly_process_group: process.env.FLY_PROCESS_GROUP,
//       };
//     },
//     browser: {
//       asObject: true,
//     },
//   });
// }

export const honoLogger: MiddlewareHandler = async (c, next) => {
  const path = getPath(c.req.raw);
  const method = c.req.method;
  const requestId = c.get('requestId');

  log
    .withMetadata({
      requestId,
      path,
      method,
    })
    .debug('Request received');

  const start = Date.now();

  await next();

  const duration = Date.now() - start;

  log
    .withMetadata({
      requestId,
      path,
      method,
      duration,
      durationHumanized: time(duration),
    })
    .debug('Request completed');
};

function time(delta: number): string {
  return delta < 1000 ? `${delta}ms` : `${Math.round(delta / 1000)}s`;
}
