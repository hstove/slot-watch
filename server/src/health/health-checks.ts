import { db } from "../db";
import { eq, desc, and, inArray, getTableColumns } from "drizzle-orm";
import {
	blockPushes,
	blockProposals as blockProposalsSchema,
	blockResponses as blockResponsesSchema,
	type BlockResponseDb,
} from "../schema";
import { getPoxInfo, getStackerSet } from "../stacks-api";
import { hex } from "@scure/base";
import { knownSigners, type StackerSetSigner } from "slot-watch-common";

export async function getRecentBlocksHealth(networkKey: string) {
	const { rewardCycleId } = await getPoxInfo.get(networkKey);
	const { signers, signersByKey, totalWeight } = await getStackerSet(
		networkKey,
		rewardCycleId,
	);

	const recentBlocks = await db
		.select({
			...getTableColumns(blockProposalsSchema),
			pushedAt: blockPushes.createdAt,
		})
		.from(blockProposalsSchema)
		.where(
			and(
				eq(blockProposalsSchema.networkKey, networkKey),
				eq(blockPushes.networkKey, networkKey),
			),
		)
		.leftJoin(
			blockPushes,
			eq(
				blockProposalsSchema.signerSignatureHash,
				blockPushes.signerSignatureHash,
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
		let weightAccept = 0;
		let weightReject = 0;
		const alreadyCounted = new Set<string>();
		const blockSigners: Record<string, { accepted: boolean | null }> = {};
		for (const response of responses) {
			const signer = signersByKey.get(response.signerPublicKey ?? "");
			if (!signer || !response.signerPublicKey) {
				continue;
			}
			const { weight } = signer;
			if (alreadyCounted.has(response.signerPublicKey)) {
				continue;
			}
			blockSigners[response.signerPublicKey] = {
				...signer,
				accepted: response.accepted,
			};
			alreadyCounted.add(response.signerPublicKey);
			if (response.accepted) {
				weightAccept += weight;
			} else {
				weightReject += weight;
			}
		}
		const signersArr = signers.map((s) => {
			return {
				...s,
				accepted: blockSigners[s.signing_key]?.accepted ?? null,
				entity: knownSigners[s.signing_key] ?? null,
			};
		});
		const rejectRatio = weightReject / totalWeight;
		const acceptRatio = weightAccept / totalWeight;
		const accepted =
			acceptRatio >= 0.7 ? true : rejectRatio >= 0.3 ? false : null;
		return {
			...b,
			weightAccept,
			weightReject,
			rejectRatio,
			acceptRatio,
			accepted,
			// signers: signersArr,
		};
	});

	return {
		blocks: blocksWithInfo,
	};
}
