import { Cause, Layer, Effect } from 'effect';
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
    Effect.tapErrorCause((cause) => {
      const errors = Cause.prettyErrors(cause);
      const errorMessage =
        errors.map((error) => error.message).join('; ') ||
        'Unknown Effect failure';
      return Effect.logError(
        `Error processing stacks block event: ${errorMessage}`,
        {
          errorMessage,
        }
      );
    })
  );

  return Effect.runPromise(pipeline);
}
