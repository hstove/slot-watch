import { and, gte, lte } from 'drizzle-orm';
import { makeDb } from '../src/db/db';
import { stateMachineUpdates } from '../src/db/schema';
import { serializeStateMachineUpdate } from '../src/db/state-machines';
import { writeFile } from 'node:fs/promises';
import { getStackerSet } from '../src/stacks-api';
// import { getStackerSet } from 'slot-watch-common';

const signers = await getStackerSet('mainnet', 111);

const end = '2025-06-13T15:25:54.204Z';
const start = '2025-06-13T15:00:54.204Z';

const db = makeDb();

const updates = await db
  .select()
  .from(stateMachineUpdates)
  // .where(
  //   and(
  //     gte(stateMachineUpdates.createdAt, new Date(start)),
  //     lte(stateMachineUpdates.createdAt, new Date(end)),
  //   ),
  // )
  // .orderBy(stateMachineUpdates.createdAt);
  .limit(1);

const stateMachines = updates.map(serializeStateMachineUpdate).map((update) => {
  const signer = signers.signers.find(
    (signer) => signer.signing_key === update.signerPublicKey,
  );
  return {
    ...update,
    signer,
  };
});

console.log(stateMachines);

await writeFile(
  '../data/state-machines.json',
  JSON.stringify(stateMachines, null, 2),
  {
    encoding: 'utf-8',
  },
);
