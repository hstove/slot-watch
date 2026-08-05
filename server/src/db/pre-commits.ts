import { and, asc, eq } from 'drizzle-orm';
import type { Db } from './db';
import { type BlockPreCommitDb, blockPreCommits } from './schema';

/**
 * Fetches every stored pre-commit for a block, oldest first.
 *
 * Ordered by `id` (uuidv7, so monotonic in observation time) because
 * consumers apply a first-pre-commit-wins rule per signer.
 */
export function getBlockPreCommits(
  db: Db,
  {
    signerSignatureHash,
    networkKey,
  }: { signerSignatureHash: string; networkKey: string }
): Promise<BlockPreCommitDb[]> {
  return db
    .select()
    .from(blockPreCommits)
    .where(
      and(
        eq(blockPreCommits.networkKey, networkKey),
        eq(blockPreCommits.signerSignatureHash, signerSignatureHash)
      )
    )
    .orderBy(asc(blockPreCommits.id));
}
