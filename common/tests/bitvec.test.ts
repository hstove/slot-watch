import { test, expect } from 'vitest';
import { BitVecCoder } from '../src';

test('bitvec', () => {
  const data = [0, 10, 0, 0, 0, 2, 41, 0];
  const decoded = BitVecCoder.decode(new Uint8Array(data));
  expect(decoded).toEqual({
    length: 10,
    bytes: new Uint8Array([41, 0]),
  });
  const encoded = BitVecCoder.encode(decoded);
  expect(encoded).toEqual(new Uint8Array(data));
  // console.log(decoded);
});
