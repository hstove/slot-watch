import { Hono } from "hono";
import { db } from "../db";
import { eq } from "drizzle-orm";
import { blockPushes, blockProposals, blockResponses } from "../schema";
import { getBurnAddress } from "../constants";

const getRecentsRoutes = new Hono();

getRecentsRoutes.get("/signer-recency/:networkKey/:cycleId", async (c) => {
	const networkKey = c.req.param("networkKey");
	const cycleId = Number.parseInt(c.req.param("cycleId"), 10);
	const page = cycleId % 2;
	const burnAddress = getBurnAddress(networkKey);
	const contractId = `${burnAddress}.signers-${page}-1`;

	// const [blockPushed] = await db
	// 	.select()
	// 	.from(blockPushes)
	// 	.where(eq(blockPushes.networkKey, networkKey))
	// 	.limit(1);

	// const responses = await db
	//   .select()
	//   .from(blockResponses)
	//   .groupBy(blockResponses.signerPublicKey)
	//   .where(eq(blockResponses.networkKey, networkKey))
	//   .orderBy(desc(blockResponses.createdAt))
	//   .limit(100);
});

export { getRecentsRoutes };
