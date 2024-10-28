import { Hono } from "hono";
import { db } from "../db";
import { desc, eq } from "drizzle-orm";
import {
	blockPushes,
	blockProposals,
	blockResponses,
	stackerDbSlots,
} from "../schema";
import { getBurnAddress } from "../constants";
import {
	chunkTypeName,
	decodeChunkMaybe,
	recoverChunkPublicKey,
	type ChunkEvent,
	type ChunkEventParsed,
} from "slot-watch-common";
import { hex } from "@scure/base";
import { serialize } from "superjson";

const getChunksRoutes = new Hono();

getChunksRoutes.get("/chunks/:networkKey", async (c) => {
	const networkKey = c.req.param("networkKey");

	const chunks = await db
		.select()
		.from(stackerDbSlots)
		.where(eq(stackerDbSlots.networkKey, networkKey))
		.orderBy(desc(stackerDbSlots.createdAt))
		.limit(1000);

	const chunkEvents: ChunkEventParsed[] = chunks.map((chunk) => {
		const publicKey = recoverChunkPublicKey(chunk).toHex();
		return {
			slotId: chunk.slotId,
			version: chunk.version,
			contractId: chunk.contractId,
			signature: hex.encode(chunk.signature),
			data: hex.encode(chunk.data),
			createdAt: chunk.createdAt.toISOString(),
			publicKey: publicKey,
			type: chunkTypeName(chunk.data),
		};
	});

	return c.json(chunkEvents);
});

export { getChunksRoutes };
