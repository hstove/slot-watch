import { Hono } from 'hono';
import { streamSSE } from 'hono/streaming';
import { EventEmitter } from 'node:events';
import { cors } from 'hono/cors';

const ee = new EventEmitter();

const app = new Hono()
  .use(cors())
  .get('/', (c) => {
    return c.text('Hello World');
  })
  .post('/:networkKey', async (c) => {
    const networkKey = c.req.param('networkKey');
    const data = await c.req.json();
    console.info('Received data', networkKey, data.type);
    ee.emit(networkKey, data);
    return c.text('OK');
  })
  .get('/stream/:networkKey', (c) => {
    const networkKey = c.req.param('networkKey');
    return streamSSE(c, (stream) => {
      console.debug(`Starting stream for ${networkKey}`);
      function handler(message: unknown) {
        console.debug(`Sending message to stream for ${networkKey}`);
        stream.writeSSE({
          event: 'message',
          data: JSON.stringify(message),
        });
      }
      return new Promise((resolve) => {
        ee.on(networkKey, handler);
        stream.onAbort(() => {
          console.debug(`Aborting stream for ${networkKey}`);
          ee.off(networkKey, handler);
          resolve();
        });
      });
    });
  });

export default app;
