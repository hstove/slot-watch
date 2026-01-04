import { Effect, Schema } from 'effect';
import { env } from 'cloudflare:workers';
import type { WSPayload } from 'slot-watch-common';
import { HttpClient, HttpClientRequest } from '@effect/platform';

export class StreamerError extends Schema.TaggedError<StreamerError>()(
  '@errors/StreamerError',
  {
    cause: Schema.Unknown,
  }
) {}

export class StreamerService extends Effect.Service<StreamerService>()(
  '@app/streamer',
  {
    effect: Effect.gen(function* () {
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
            Effect.catchAllCause((cause) =>
              Effect.fail(new StreamerError({ cause }))
            )
          ),
      };
    }),
  }
) {}
