import { db } from './db';
import { eq, desc, and, inArray, getTableColumns } from 'drizzle-orm';
import {
  blockPushes,
  blockProposals as blockProposalsSchema,
  blockResponses as blockResponsesSchema,
  type BlockResponseDb,
} from './schema';
import { getPoxInfo, getStackerSet } from '../stacks-api';
import { hex } from '@scure/base';
import { knownSigners, type StackerSetSigner } from 'slot-watch-common';
import { mapSignerDataToResponses } from './block-responses';

export async function getRecentBlocksHealth(networkKey: string) {
  const { rewardCycleId } = await getPoxInfo.get(networkKey);
  const stackerSet = await getStackerSet(networkKey, rewardCycleId);

  const recentBlocks = await db
    .select({
      ...getTableColumns(blockProposalsSchema),
      pushedAt: blockPushes.createdAt,
    })
    .from(blockProposalsSchema)
    .where(eq(blockProposalsSchema.networkKey, networkKey))
    .leftJoin(
      blockPushes,
      and(
        eq(
          blockProposalsSchema.signerSignatureHash,
          blockPushes.signerSignatureHash,
        ),
        eq(blockPushes.networkKey, blockProposalsSchema.networkKey),
      ),
    )
    .orderBy(desc(blockProposalsSchema.chainLength))
    .limit(50);

  const blockResponses = await db
    .select()
    .from(blockResponsesSchema)
    .where(
      and(
        eq(blockResponsesSchema.networkKey, networkKey),
        inArray(
          blockResponsesSchema.signerSignatureHash,
          recentBlocks.map((b) => b.signerSignatureHash),
        ),
      ),
    )
    .orderBy(desc(blockResponsesSchema.createdAt));

  const responsesByBlock = new Map<string, BlockResponseDb[]>();

  for (const response of blockResponses) {
    const block = responsesByBlock.get(response.signerSignatureHash) ?? [];
    block.push(response);
    responsesByBlock.set(response.signerSignatureHash, block);
  }

  const blocksWithInfo = recentBlocks.map((b) => {
    const responses = responsesByBlock.get(b.signerSignatureHash) ?? [];
    const responseInfo = mapSignerDataToResponses({
      stackerSet: stackerSet,
      responses,
    });
    const weightPending =
      responseInfo.totalWeight -
      responseInfo.weightAccept -
      responseInfo.weightReject;
    const countPending =
      responseInfo.signers.length -
      responseInfo.countAccepted -
      responseInfo.countRejected;
    const pendingRatio = weightPending / responseInfo.totalWeight;
    return {
      ...b,
      ...responseInfo,
      countPending,
      pendingRatio,
      weightPending,
    };
  });

  return {
    blocks: blocksWithInfo,
  };
}
