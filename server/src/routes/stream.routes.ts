import { Hono } from 'hono';
import { streamSSE } from 'hono/streaming';
import { subClient } from '../redis';
import { logger as _logger } from '../logger';

const logger = _logger.child({
  module: 'streamRoutes',
});

export const streamRoutes = new Hono().get('/stream/:networkKey', (c) => {
  const networkKey = c.req.param('networkKey');
  return streamSSE(c, async (stream) => {
    logger.debug(`Starting stream for ${networkKey}`);
    function handler(pattern: string, channel: string, message: string) {
      if (channel === networkKey) {
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
    }
    return new Promise((resolve) => {
      subClient.on('pmessage', handler);
      stream.onAbort(() => {
        logger.debug(`Aborting stream for ${networkKey}`);
        subClient.off('pmessage', handler);
        resolve();
      });
    });
  });
});
