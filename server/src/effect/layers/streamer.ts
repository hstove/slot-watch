import { Layer, Effect } from 'effect';
import { env } from 'cloudflare:workers';
import type { StreamerService } from '../tags';
import { StreamerServiceTag, StreamerError } from '../tags';

export const StreamerLive = Layer.succeed(
  StreamerServiceTag,
  {
    publish: (payload: import('slot-watch-common').WSPayload) =>
      Effect.tryPromise({
        try: async () => {
          const url = env.STREAMER_URL;
          const res = await fetch(`${url}/${payload.networkKey}`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(payload),
          });
          
          if (!res.ok) {
            throw new Error(`Streamer HTTP ${res.status}: ${res.statusText}`);
          }
        },
        catch: (e) => new StreamerError(e),
      }),
  }
);