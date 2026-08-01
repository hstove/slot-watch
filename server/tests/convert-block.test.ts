import { expect, test } from 'bun:test';
import { convertBlock } from '../src/events/convert-block';
import { clarity6Block } from './fixtures/clarity6-block';

test('converts a block containing a Clarity 6 contract deployment', () => {
  const block = convertBlock(clarity6Block);

  expect(block.blockHeight).toEqual(8_665_752);
  expect(block.txCount).toEqual(1);
  expect(block.txFees).toEqual(40_900);
});
