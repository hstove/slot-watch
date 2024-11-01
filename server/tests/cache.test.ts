import { test, expect } from 'vitest';
import { memoizeCache } from '../src/cache';
import type { F, A } from 'ts-toolbelt';

let runs = 0;

const testing = (a: number) => {
  runs++;
  return Promise.resolve(a);
};

type R = A.Promise<F.Return<typeof testing>>;

test('memoizeCache', async () => {
  runs = 0;
  const memoized = memoizeCache((a: number) => `test_${a}`, testing);
  memoized.clear(1);

  const result = await memoized.get(1);
  expect(runs).toBe(1);
  expect(result).toBe(1);
  await memoized.warm(2);
  expect(runs).toBe(2);

  const result2 = await memoized.get(2);
  expect(result2).toBe(2);
  expect(runs).toBe(2);
});
