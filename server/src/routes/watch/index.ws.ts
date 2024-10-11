import { ws } from "@stricjs/app";

const CHUNKS_EVENT = "chunks";
const BURN_BLOCKS_EVENT = "burn_blocks";

export default ws.route({
	async open(ws) {
		ws.subscribe(CHUNKS_EVENT);
		ws.subscribe(BURN_BLOCKS_EVENT);
	},
	async message(ws, message) {},
	async close(ws, code, reason) {
		ws.unsubscribe(CHUNKS_EVENT);
		ws.unsubscribe(BURN_BLOCKS_EVENT);
	},
});
