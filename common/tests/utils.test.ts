import { sha256 } from '@noble/hashes/sha256';
import {
  getSortableVersion,
  getVersionFromString,
  hash160,
  superSerialize,
} from '../src/utils';
import { test, expect } from 'vitest';
import { hex } from '@scure/base';

test('getVersionFromString', () => {
  expect(getVersionFromString('stacks-signer 1.0.0 (...')).toBe('1.0.0');
  expect(getVersionFromString('stacks-signer 1.0.0')).toBe('1.0.0');
  expect(
    getVersionFromString(
      'stacks-signer 1528a57 (develop:1528a57, release build, linux [x86_64])'
    )
  ).toBe('1528a57');
  expect(
    getVersionFromString('stacks-signer 0.0.1 (:release build, linux [x86_64])')
  ).toBe('0.0.1');
  expect(
    getVersionFromString(
      'stacks-node 3.1.0.0.5 (:release build, linux [x86_64])'
    )
  ).toBe('3.1.0.0.5');
  expect(getVersionFromString('')).toEqual('');
});

test('hash160', () => {
  expect(
    hex.encode(
      sha256(
        hex.decode(
          '02c35b37cd7b57fd7732b781fdec13e9318f2b6d8fdd086074fd6e5b01944da9cd'
        )
      )
    )
  ).toEqual('f3050ae4a386e81f4ec0e7943dcd487b6d8d6b423de782d2156bcecaba69a4b9');
  expect(
    hash160(
      '02c35b37cd7b57fd7732b781fdec13e9318f2b6d8fdd086074fd6e5b01944da9cd'
    )
  ).toEqual('c8f46d0b5d3147590c968e006e23dbedf73e1263');
});

test('getSortableVersion', () => {
  expect(getSortableVersion('3.1.0.0.1.0')).toEqual([3, 1, 0, 0, 1, 0]);
});

test('superSerialize', () => {
  const obj = {
    a: 1,
    b: 2,
  };
  const serialized = superSerialize(obj);
  // console.log('serialized', serialized);
  expect(serialized).toStrictEqual({ json: obj });
});
