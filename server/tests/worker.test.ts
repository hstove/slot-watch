import {
  env,
  createExecutionContext,
  waitOnExecutionContext,
} from 'cloudflare:test';
import { describe, it, expect } from 'vitest';
// Import your worker so you can unit test it
import { app } from '../src/server';

// For now, you'll need to do something like this to get a correctly-typed
// `Request` to pass to `worker.fetch()`.
const IncomingRequest = Request<unknown, IncomingRequestCfProperties>;

describe('Hello World worker', () => {
  // biome-ignore lint/suspicious/useAwait: ignored using `--suppress`
  it('responds with Hello World!', async () => {
    console.log('Hello World!');
    // const request = new IncomingRequest('http://localhost:3000/');
    // // Create an empty context to pass to `worker.fetch()`
    // const ctx = createExecutionContext();
    // const response = await app.fetch(request, env, ctx);
    // // Wait for all `Promise`s passed to `ctx.waitUntil()` to settle before running test assertions
    // await waitOnExecutionContext(ctx);
    // expect(await response.status).toBe(404);
    // expect(await response.text()).toBe('Not found');
  });
});
