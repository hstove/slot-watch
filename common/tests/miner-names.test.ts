import { expect, test } from 'vitest';
import { getMinerName, knownMiners } from '../src/miner-names';

test('known miners have unique colors and animals', () => {
  const seeds = Object.values(knownMiners);
  expect(new Set(seeds.map((s) => s.color)).size).toBe(seeds.length);
  expect(new Set(seeds.map((s) => s.animal)).size).toBe(seeds.length);
});

test('known miners use their pinned seed', () => {
  const name = getMinerName(
    '02cf020357e5b6dc07faf0904b055429cb6399b2490bb276adb571767ebf317127'
  );
  expect(name).toMatchObject({ name: 'Teal Wolf', short: 'Wolf', emoji: '🐺' });
});

test('unknown miners are deterministic and avoid known picks', () => {
  const key =
    '03aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
  const a = getMinerName(key);
  expect(getMinerName(key)).toEqual(a);
  const seeds = Object.values(knownMiners);
  expect(seeds.map((s) => s.color)).not.toContain(a.color);
  expect(seeds.map((s) => s.animal)).not.toContain(a.animal);
});
