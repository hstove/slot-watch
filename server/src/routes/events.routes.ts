import type { Server } from "bun";
import { createMiddleware } from "hono/factory";
import { Hono, type Context } from "hono";
import { getPayloadContractId } from "../utils";
import {
	CHUNKS_EVENT,
	BURN_BLOCKS_EVENT,
	type StackerDBPayload,
	type ChunkEvent,
	type WSChunkEvent,
	type WSNewBlock,
	type CoreNodeBlockMessage,
	NEW_BLOCK_EVENT,
} from "slot-watch-common";
import { getNetworkKey, getNetworkKeyHono } from "../auth";
import { handleStackerDBChunk } from "../events/stackerdb";

export const getBunServer = (c: Context): Server => {
	const server = ("server" in c.env ? c.env.server : c.env) as
		| Server
		| undefined;
	if (!server) {
		throw new Error("Server not found");
	}
	return server;
};

type Env = {
	Variables: {
		networkKey: string;
	};
};

const basicAuthMiddleware = createMiddleware<Env>(async (c, next) => {
	const networkKey = getNetworkKeyHono(c.req);
	if (!networkKey) {
		return new Response("Unauthorized", { status: 200 });
	}
	c.set("networkKey", networkKey);
	await next();
});

const eventsRoutes = new Hono<Env>();

eventsRoutes.use(basicAuthMiddleware);

// handle getting network key
eventsRoutes.post("/stackerdb_chunks", basicAuthMiddleware, async (c) => {
	const server = getBunServer(c);
	const networkKey = c.get("networkKey");
	const data = await c.req.json<StackerDBPayload>();
	const contractId = getPayloadContractId(data);
	console.log(
		`${networkKey}: Got ${data.modified_slots.length} updates for ${contractId}`,
	);
	const receivedAt = new Date();
	for (const chunk of data.modified_slots) {
		const sharedPayload: WSChunkEvent = {
			type: CHUNKS_EVENT,
			networkKey,
			receivedAt: receivedAt.toISOString(),
			payload: {
				slotId: chunk.slot_id,
				version: chunk.slot_version,
				contractId,
				signature: chunk.sig,
				data: chunk.data,
				createdAt: receivedAt.toISOString(),
			},
		};
		server.publish(CHUNKS_EVENT, JSON.stringify(sharedPayload));
	}
	process.nextTick(async () => {
		try {
			await handleStackerDBChunk(data, receivedAt, networkKey);
		} catch (error) {
			console.error(`Error handling stacker db chunk: ${error}`);
		}
	});
	return new Response("OK", { status: 200 });
});

eventsRoutes.post("/new_block", async (c) => {
	const server = getBunServer(c);
	const networkKey = c.get("networkKey");
	const data = await c.req.json<CoreNodeBlockMessage>();
	console.log(`${networkKey}: Got new Block`);
	const receivedAt = new Date();
	const sharedPayload: WSNewBlock = {
		type: NEW_BLOCK_EVENT,
		networkKey,
		payload: data,
		receivedAt: receivedAt.toISOString(),
	};
	server.publish(NEW_BLOCK_EVENT, JSON.stringify(sharedPayload));
	return new Response("OK", { status: 200 });
});

export default eventsRoutes;
