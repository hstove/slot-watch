import { db } from "../db";
import { eq, desc, and, inArray } from "drizzle-orm";
import {
	blockPushes,
	blockProposals as blockProposalsSchema,
	blockResponses as blockResponsesSchema,
	type BlockResponseDb,
} from "../schema";
import { getPoxInfo, getStackerSet } from "../stacks-api";
import { hex } from "@scure/base";
import type { StackerSetSigner } from "slot-watch-common";

export async function checkForAllRejections() {
	const networkKey = "mainnet";
	const { rewardCycleId } = await getPoxInfo.get(networkKey);
	const { signers, signersByKey, totalWeight } = await getStackerSet(
		networkKey,
		rewardCycleId,
	);

	const recentBlocks = await db
		.select()
		.from(blockProposalsSchema)
		.where(eq(blockProposalsSchema.networkKey, networkKey))
		.orderBy(desc(blockProposalsSchema.createdAt))
		.limit(10);

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
		let weightAccept = 0;
		let weightReject = 0;
		for (const response of responses) {
			const weight =
				signersByKey.get(response.signerPublicKey ?? "")?.weight ?? 0;
			if (response.accepted) {
				weightAccept += weight;
			} else {
				weightReject += weight;
			}
		}
		return {
			...b,
			weightAccept,
			weightReject,
		};
	});
}
