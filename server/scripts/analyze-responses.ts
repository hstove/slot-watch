import { asc, eq } from 'drizzle-orm';
import { makeDb } from '../src/db/db';
import { blockProposals, blockResponses } from '../src/db/schema';
import { getCreatedAt } from '../src/utils';

const [blockHash] = process.argv.slice(2);

async function run() {
  const db = makeDb();
  await db.$client.connect();

  if (!blockHash) {
    console.error('Block hash is required');
    process.exit(1);
  }

  const blockProposal = await db.query.blockProposals.findFirst({
    where: eq(blockProposals.signerSignatureHash, blockHash),
  });

  if (!blockProposal) {
    console.error(`Block proposal not found for hash: ${blockHash}`);
    process.exit(1);
  }

  const proposedAt = getCreatedAt(blockProposal.id);

  const responses = await db.query.blockResponses.findMany({
    where: eq(blockResponses.signerSignatureHash, blockHash),
    orderBy: [asc(blockResponses.id)],
  });

  console.log(`Proposed at: ${proposedAt.toISOString()}`);

  for (const response of responses) {
    const createdAt = getCreatedAt(response.id);
    console.log(`Response at: ${createdAt.toISOString()}`);
  }
}

run()
  .catch(console.error)
  .finally(() => {
    process.exit();
  });
