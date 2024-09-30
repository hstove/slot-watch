import { hex } from "@scure/base";
import { db } from "./db";
import { getPayloadContractId, type StackerDBPayload } from "./payload";
import { stackerDbSlots } from "./schema";
import { eq, desc } from "drizzle-orm";
import { burnAddress } from "./constants";
import { getNetworkKey } from "./auth";

function makeContractIdQuery(contractIdQuery: string | null) {
	if (typeof contractIdQuery === "string") {
		let contractId = contractIdQuery;
		if (!contractIdQuery.includes(".")) {
			contractId = `${burnAddress}.${contractIdQuery}`;
		}
		return eq(stackerDbSlots.contractId, contractId);
	}
	return undefined;
}

const CHUNKS_EVENT = "chunks";
const BURN_BLOCKS_EVENT = "burn_blocks";

const server = Bun.serve({
	port: 1080,
	async fetch(req) {
		const url = new URL(req.url);
		const networkKey = getNetworkKey(req);
		console.log(`${url.pathname} with network key ${networkKey ?? "none"}`);
		if (url.pathname === "/stackerdb_chunks") {
			const data = (await req.json()) as StackerDBPayload;
			const contractId = getPayloadContractId(data);
			console.log(
				`Got ${data.modified_slots.length} updates for ${contractId}`,
			);
			const receivedAt = new Date();
			for (const chunk of data.modified_slots) {
				const sharedPayload = {
					slotId: chunk.slot_id,
					version: chunk.slot_version,
					contractId,
					networkKey,
				};
				server.publish(
					CHUNKS_EVENT,
					JSON.stringify({
						...sharedPayload,
						signature: chunk.sig,
						data: chunk.data,
						createdAt: receivedAt.toISOString(),
					}),
				);
				await db.insert(stackerDbSlots).values({
					...sharedPayload,
					signature: hex.decode(chunk.sig),
					data: hex.decode(chunk.data),
					createdAt: receivedAt,
				});
			}
			return new Response("OK", { status: 200 });
		}

		if (url.pathname === "/new_burn_block") {
			const data = await req.json();
			// server.publish(BURN_BLOCKS_EVENT, JSON.stringify(data));
		}

		if (url.pathname === "/get_chunks") {
			const contractIdQuery = url.searchParams.get("contractId");
			console.log(`Getting chunks for ${contractIdQuery}`);
			const chunks = await db
				.select()
				.from(stackerDbSlots)
				.where(makeContractIdQuery(contractIdQuery))
				.orderBy(desc(stackerDbSlots.createdAt))
				.limit(100);
			const chunksResponse = chunks.map((chunk) => {
				return {
					slotId: chunk.slotId,
					receivedAt: chunk.createdAt,
					version: chunk.version,
					data: hex.encode(chunk.data),
				};
			});
			return new Response(JSON.stringify(chunksResponse), {
				status: 200,
				headers: {
					"Content-Type": "application/json",
				},
			});
		}

		if (url.pathname === "/watch") {
			if (server.upgrade(req)) {
				return; // do not return a Response
			}
			return new Response("Upgrade failed", { status: 500 });
		}

		return new Response("Hello World");
	},
	websocket: {
		async open(ws) {
			ws.subscribe(CHUNKS_EVENT);
			ws.subscribe(BURN_BLOCKS_EVENT);
		},
		async message(ws, message) {},
		async close(ws, code, reason) {
			ws.unsubscribe(CHUNKS_EVENT);
			ws.unsubscribe(BURN_BLOCKS_EVENT);
		},
	},
});

console.log(`Server is running on ${server.url}`);
