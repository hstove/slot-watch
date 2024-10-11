import { Hono } from "hono";
import { db } from "../db";
import { eq } from "drizzle-orm";
import { blockPushes, blockProposals, blockResponses } from "../schema";

const getBlockRoute = new Hono();

getBlockRoute.get("/get_block/:blockId", async (c) => {
	const blockId = c.req.param("blockId");
	if (blockId === null) {
		return c.text("Missing blockId", 400);
	}

	const [blockPushed] = await db
		.select()
		.from(blockPushes)
		.where(eq(blockPushes.signerSignatureHash, blockId))
		.limit(1);
	const [proposal] = await db
		.select()
		.from(blockProposals)
		.where(eq(blockProposals.signerSignatureHash, blockId))
		.limit(1);
	const responses = await db
		.select()
		.from(blockResponses)
		.where(eq(blockResponses.signerSignatureHash, blockId));
	const response = {
		proposal,
		responses,
		blockPushed,
	};
	return c.json(response);
});

export { getBlockRoute };
