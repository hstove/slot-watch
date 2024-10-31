import { Hono } from "hono";
import { db } from "../db/db";
import { and, eq } from "drizzle-orm";
import { blockPushes, blockProposals, blockResponses } from "../db/schema";
import { getPoxInfo, getStackerSet } from "../stacks-api";
import { mapSignerDataToResponses } from "../db/block-responses";

const getBlockRoute = new Hono();

getBlockRoute.get("/get_block/:networkKey/:blockId", async (c) => {
	const networkKey = c.req.param("networkKey");
	const blockId = c.req.param("blockId");
	const { rewardCycleId } = await getPoxInfo.get(networkKey);
	const stackerSet = await getStackerSet(networkKey, rewardCycleId);

	const [pushes] = await db
		.select()
		.from(blockPushes)
		.where(
			and(
				eq(blockPushes.signerSignatureHash, blockId),
				eq(blockPushes.networkKey, networkKey),
			),
		)
		.limit(1);
	const [proposal] = await db
		.select()
		.from(blockProposals)
		.where(
			and(
				eq(blockProposals.signerSignatureHash, blockId),
				eq(blockProposals.networkKey, networkKey),
			),
		)
		.limit(1);
	const responses = await db
		.select()
		.from(blockResponses)
		.where(
			and(
				eq(blockResponses.signerSignatureHash, blockId),
				eq(blockResponses.networkKey, networkKey),
			),
		);

	const responsesWithSigners = mapSignerDataToResponses({
		stackerSet,
		responses,
	});

	const response = {
		proposal,
		responses: responsesWithSigners,
		pushes,
	};
	return c.json(response);
});

export { getBlockRoute };
