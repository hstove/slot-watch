import { Effect } from 'effect';
import { handleStackerDBChunk } from '../events/stackerdb';
import { ServerRuntime } from './runtime';

// Simple test to verify the Effect implementation works
const testPayload = {
  contract_id: {
    issuer: [0, Uint8Array.from([0])] as [number, Uint8Array<ArrayBufferLike>],
    name: 'test',
  },
  modified_slots: [],
};

export const testStackerDbEffect = () => {
  return Effect.runPromise(
    handleStackerDBChunk({
      payload: testPayload,
      receivedAt: new Date(),
      networkKey: 'test',
    }).pipe(
      Effect.provide(ServerRuntime),
      Effect.tapErrorCause((cause) =>
        Effect.logError('Test failed', { cause })
      ),
      Effect.tap(() =>
        Effect.logInfo('Effect implementation test completed successfully')
      )
    )
  );
};

// Export for testing if needed
export { testPayload };
