import { Layer, Effect } from 'effect';
import { DbLive, type DbService } from '../effect/layers/db';
import { StreamerService } from '../effect/layers/streamer';
import { FetchHttpClient } from '@effect/platform';

const ServerRuntime = Layer.mergeAll(
  Layer.provideMerge(StreamerService.Default, FetchHttpClient.layer),
  DbLive
);

export function runEffect<A, E>(
  effect: Effect.Effect<A, E, DbService | StreamerService>
): Promise<A> {
  const pipeline = effect.pipe(
    Effect.provide(ServerRuntime),
    Effect.tapErrorCause((cause) =>
      Effect.logError('Error processing stacks block event', { cause })
    )
  );

  return Effect.runPromise(pipeline);
}
