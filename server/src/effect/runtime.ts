import { Layer, Effect } from 'effect';
import { DbLive } from './layers/db';
import { StreamerLive } from './layers/streamer';
import type { DbService, StreamerService } from './tags';
import { FetchHttpClient } from '@effect/platform';
import { NodeRuntime } from '@effect/platform-node';

export const ServerRuntime = Layer.mergeAll(
  Layer.provideMerge(FetchHttpClient.layer, StreamerLive),
  DbLive
);

export function runWithServerRuntime<A, E>(
  effect: Effect.Effect<A, E, DbService | StreamerService>
) {
  return NodeRuntime.runMain(
    effect.pipe(
      Effect.provide(ServerRuntime),
      Effect.provide(FetchHttpClient.layer),
      Effect.tapErrorCause((cause) =>
        Effect.logError('Error processing stacks block event', { cause })
      )
    )
  );
}
