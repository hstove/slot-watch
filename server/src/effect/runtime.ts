import { Layer, Effect } from 'effect';
import { DbLive } from './layers/db';
import { StreamerLive } from './layers/streamer';
import type { DbService, StreamerService } from './tags';

export const ServerRuntime = Layer.mergeAll(DbLive, StreamerLive);

export function runWithServerRuntime<A, E>(
  effect: Effect.Effect<A, E, DbService | StreamerService>,
) {
  return Effect.runPromise(
    effect.pipe(
      Effect.provide(ServerRuntime),
      Effect.tapErrorCause((cause) =>
        Effect.logError('Error processing stacks block event', { cause }),
      ),
    ),
  );
}
