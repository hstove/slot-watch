import { TenureChangeCause } from '@stacks/transactions';
import { convertBlock } from '../src/events/block-events';
import { tenureExtendBlock } from './fixtures';
import { test, expect } from 'vitest';
import { db } from '../src/db/db';
import { stateMachineUpdates } from '../src/db/schema';
import type { StateMachineUpdate } from 'slot-watch-common';
import type { SuperJSON } from 'slot-watch-common';
import { sql } from 'drizzle-orm';

// test('convert block', () => {
//   const block = convertBlock(tenureExtendBlock);
//   console.log(block);
//   expect(block.tenureChangeCause).toEqual(TenureChangeCause.Extended);
// });

test('inserting a state machine update', async () => {
  const updateContent = {
    test: 'test',
  };
  // const updateContentSerialized = superSerialize(updateContent);
  const [newRow] = await db
    .insert(stateMachineUpdates)
    .values({
      // updateContent: updateContent as SuperJSON<
      //   StateMachineUpdate['stateMachineUpdate']
      // >,
      updateContent: sql<
        SuperJSON<StateMachineUpdate['stateMachineUpdate']>
      >`${updateContent}::json`,
      signerPublicKey: 'test',
      networkKey: 'test',
      localSignerProtocolVersion: 1,
      activeSignerProtocolVersion: 1,
    })
    .returning();
  expect(newRow?.updateContent).toEqual(updateContent);
});
