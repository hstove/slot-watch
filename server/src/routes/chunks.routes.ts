import { Hono } from "hono";
import { db } from "../db/db";
import { desc, eq, inArray, and, gte, lte, asc } from "drizzle-orm";
import { stackerDbSlots } from "../db/schema";
import type {
	ChunkEventParsed,
	TimelineChunk,
	TimelineResponse,
} from "slot-watch-common";
import * as P from "micro-packed";
import { serializeDbChunk } from "../utils";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";

const getChunksRoutes = new Hono()

	.get("/chunks/timeline", zValidator("query", z.object({})), async (c) => {
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

			const chunkEvent = serializeDbChunk(chunk);

			return {
				...chunkEvent,
				others: othersFound,
			};
		});

		return c.json<TimelineResponse>({
			chunks: groupedChunks,
		});
	})

	.get("/chunks/:networkKey/:from/:to", async (c) => {
		const networkKey = c.req.param("networkKey");
		function getDate(key: string) {
			const param = c.req.param(key);
			if (!param) {
				throw new Error(`${key} is required`);
			}
			return new Date(Number.parseInt(param, 10));
		}
		const from = getDate("from");
		const to = getDate("to");

		const chunks = await db
			.select()
			.from(stackerDbSlots)
			.where(
				and(
					eq(stackerDbSlots.networkKey, networkKey),
					gte(stackerDbSlots.createdAt, from),
					lte(stackerDbSlots.createdAt, to),
				),
			)
			.orderBy(asc(stackerDbSlots.createdAt))
			.limit(5000);

		return c.json<{ chunks: ChunkEventParsed[] }>({
			chunks: chunks.map(serializeDbChunk),
		});
	})

	.get("/chunks/:networkKey", async (c) => {
		const networkKey = c.req.param("networkKey");

		const chunks = await db
			.select()
			.from(stackerDbSlots)
			.where(eq(stackerDbSlots.networkKey, networkKey))
			.orderBy(desc(stackerDbSlots.createdAt))
			.limit(1000);

		const chunkEvents: ChunkEventParsed[] = chunks.map(serializeDbChunk);

		return c.json(chunkEvents);
	});

export { getChunksRoutes };
