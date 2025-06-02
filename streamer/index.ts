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
    return streamSSE(c, async (stream) => {
      console.debug(`Starting stream for ${networkKey}`);
      function handler(message: unknown) {
        console.debug(`Sending message to stream for ${networkKey}`);
        stream.writeSSE({
          event: 'message',
          data: JSON.stringify(message),
        });
      }
      // biome-ignore lint/suspicious/noAsyncPromiseExecutor: <explanation>
      return new Promise(async (resolve) => {
        ee.on(networkKey, handler);
        // await client.pSubscribe('*', handler);
        stream.onAbort(async () => {
          console.debug(`Aborting stream for ${networkKey}`);
          // await client.pUnsubscribe('*', handler);
          ee.off(networkKey, handler);
          resolve();
        });
      });
    });
  });

export default app;
