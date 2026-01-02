import { Layer, Effect } from 'effect';
import { DbLive } from './layers/db';
import { StreamerLive } from './layers/streamer';
import type { DbService, StreamerService } from './tags';
import { FetchHttpClient } from '@effect/platform';

// Create the server runtime layer, composing all required layers
// StreamerLive needs HttpClient, so we provide FetchHttpClient.layer to it
const StreamerWithDeps = Layer.provide(StreamerLive, FetchHttpClient.layer);

export const ServerRuntime = Layer.mergeAll(StreamerWithDeps, DbLive);

export function runWithServerRuntime<A, E>(
  effect: Effect.Effect<A, E, DbService | StreamerService>
): Promise<A> {
  const pipeline = effect.pipe(
    Effect.provide(ServerRuntime),
    Effect.tapErrorCause((cause) =>
      Effect.logError('Error processing stacks block event', { cause })
    )
  );

  // Type cast needed due to cross-package type inference limitations
  return Effect.runPromise(pipeline as Effect.Effect<A, E, never>);
}
