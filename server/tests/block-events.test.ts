import { TenureChangeCause } from '@stacks/transactions';
import { convertBlock } from '../src/events/block-events';
import { tenureExtendBlock } from './fixtures';
import { test, expect } from 'vitest';

test('convert block', () => {
  const block = convertBlock(tenureExtendBlock);
  console.log(block);
  expect(block.tenureChangeCause).toEqual(TenureChangeCause.Extended);
});
