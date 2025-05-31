import { Hono } from 'hono';
import { streamSSE } from 'hono/streaming';
import { redis } from '../redis';
import { logger as _logger } from '../logger';

const logger = _logger.child({
  module: 'streamRoutes',
});

export const streamRoutes = new Hono().get('/stream/:networkKey', (c) => {
  const networkKey = c.req.param('networkKey');
  return streamSSE(c, async (stream) => {
    logger.debug(`Starting stream for ${networkKey}`);
    // function handler(pattern: string, channel: string, message: string) {
    function handler(message: string) {
      logger.debug(`Sending message to stream for ${networkKey}`);
      try {
        stream.writeSSE({
          event: 'message',
          data: message,
        });
      } catch (error) {
        logger.error(
          {
            error,
          },
          'Error writing to stream',
        );
      }
    }
    // biome-ignore lint/suspicious/noAsyncPromiseExecutor: <explanation>
    return new Promise(async (resolve) => {
      const listener = redis.subscribe<string>(networkKey);
      listener.on('message', (e) => handler(e.message));
      stream.onAbort(async () => {
        logger.debug(`Aborting stream for ${networkKey}`);
        listener.unsubscribe();
        resolve();
      });
    });
  });
});
