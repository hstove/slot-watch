import { Hono } from "hono";
import { db } from "../db";
import { desc, eq, inArray } from "drizzle-orm";
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
	type TimelineChunk,
	type TimelineResponse,
} from "slot-watch-common";
import { hex } from "@scure/base";
import { serialize } from "superjson";
import * as P from "micro-packed";

const getChunksRoutes = new Hono();

getChunksRoutes.get("/chunks/timeline", async (c) => {
	const networkKeys = (c.req.query("networkKeys") ?? "").split(",");

	const [first, ...otherNetworks] = networkKeys;
	if (!first) {
		throw new Error("No network key provided");
	}

	const firstChunks = await db
		.select()
		.from(stackerDbSlots)
		.where(eq(stackerDbSlots.networkKey, first))
		.orderBy(desc(stackerDbSlots.createdAt))
		.limit(200);

	const otherChunks = await db
		.select()
		.from(stackerDbSlots)
		.where(inArray(stackerDbSlots.networkKey, otherNetworks))
		.orderBy(desc(stackerDbSlots.createdAt))
		.limit(400);

	const groupedChunks: TimelineChunk[] = firstChunks.map((chunk) => {
		const othersFound = Object.fromEntries(
			otherNetworks.map((networkKey) => {
				const found = otherChunks.find((otherChunk) => {
					return (
						P.utils.equalBytes(chunk.data, otherChunk.data) &&
						otherChunk.networkKey === networkKey &&
						otherChunk.version === chunk.version &&
						otherChunk.slotId === chunk.slotId
					);
				});

				if (typeof found === "undefined") {
					return [networkKey, null];
				}

				const diffSeconds =
					(found.createdAt.getTime() - chunk.createdAt.getTime()) / 1000;

				return [
					networkKey,
					{ createdAt: found.createdAt.toISOString(), diffSeconds },
				];
			}),
		);

		return {
			...chunk,
			signature: hex.encode(chunk.signature),
			data: hex.encode(chunk.data),
			createdAt: chunk.createdAt.toISOString(),
			others: othersFound,
		};
	});

	return c.json<TimelineResponse>({
		chunks: groupedChunks,
	});
});

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
