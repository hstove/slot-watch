import { hex } from "@scure/base";
import { db } from "./db";
import { getPayloadContractId, type StackerDBPayload } from "./payload";
import { stackerDbSlots } from "./schema";

const rows = await db.select().from(stackerDbSlots);
console.log(rows);

const server = Bun.serve({
	port: 1080,
	async fetch(req) {
		const url = new URL(req.url);
		console.log(url.pathname);
		if (url.pathname === "/stackerdb_chunks") {
			const data = (await req.json()) as StackerDBPayload;
			const contractId = getPayloadContractId(data);
			console.log(
				`Got ${data.modified_slots.length} updates for ${contractId}`,
			);
			for (const chunk of data.modified_slots) {
				await db.insert(stackerDbSlots).values({
					slotId: chunk.slot_id,
					version: chunk.slot_id,
					signature: hex.decode(chunk.sig),
					data: hex.decode(chunk.data),
					contractId,
				});
			}
			// console.log(data);
		}

		return new Response("Hello World");
	},
});
