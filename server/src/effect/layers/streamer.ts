import { Effect, Layer, pipe } from 'effect';
import { env } from 'cloudflare:workers';
import { StreamerServiceTag, StreamerError } from '../tags';
import type { WSPayload } from 'slot-watch-common';
import { HttpClient, HttpClientRequest } from '@effect/platform';

export const StreamerLive = Layer.effect(
  StreamerServiceTag,
  Effect.gen(function* () {
    const client = yield* HttpClient.HttpClient;
    return {
      publish: (payload: WSPayload) =>
        Effect.gen(function* () {
          yield* HttpClientRequest.post(
            `${env.STREAMER_URL}/${payload.networkKey}`
          ).pipe(
            HttpClientRequest.bodyJson(payload),
            Effect.flatMap(client.execute)
          );
        }).pipe(
          Effect.catchAllCause((cause) => Effect.fail(new StreamerError(cause)))
        ),
    };
  })
);
