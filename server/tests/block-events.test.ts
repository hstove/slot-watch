import { test, expect } from 'vitest';
import { makeDb } from '../src/db/db';
import { stateMachineUpdates } from '../src/db/schema';
import type { StateMachineUpdate } from 'slot-watch-common';
import type { SuperJSON } from 'slot-watch-common';
import { sql } from 'drizzle-orm';
import { v7 as uuidv7 } from 'uuid';

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
  const db = makeDb();
  const [newRow] = await db
    .insert(stateMachineUpdates)
    .values({
      id: uuidv7(),
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
