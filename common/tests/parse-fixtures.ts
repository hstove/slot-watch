import type { StackerDBPayload } from '../src';

const logPrefix =
  'INFO [1727443953.045372] [testnet/stacks-node/src/event_dispatcher.rs:1340] [relayer-http://127.0.0.1:20252] "';

export function fixtureToJson(fixture: string): StackerDBPayload {
  const [_start, rust, _, jsonLine] = fixture.split('\n');
  if (!jsonLine) {
    throw new Error('No JSON line found in the fixture');
  }
  const json = jsonLine.slice(logPrefix.length, -1).replaceAll('\\', '');
  // console.log(json);
  return JSON.parse(json);
}
