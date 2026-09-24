import { Context, Effect, Layer, Schema } from 'effect';
import { env } from 'cloudflare:workers';
import type { WSPayload } from 'slot-watch-common';
import { HttpClient, HttpClientRequest } from 'effect/unstable/http';

export class StreamerError extends Schema.TaggedError<StreamerError>()(
  '@errors/StreamerError',
  {
    cause: Schema.Unknown,
  }
) {}

export class StreamerService extends Context.Service<
  StreamerService,
  {
    publish: (payload: WSPayload) => Effect.Effect<void, StreamerError>;
  }
>()('@app/streamer') {}

export const StreamerLive = Layer.effect(
  StreamerService,
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
          Effect.catchCause((cause) =>
            Effect.fail(new StreamerError({ cause }))
          )
        ),
    };
  })
);
