import { Hono } from "hono";
import eventsRoutes, { getBunServer } from "./routes/events.routes";
import { createBunWebSocket } from "hono/bun";
import type { ServerWebSocket } from "bun";
import { BURN_BLOCKS_EVENT, CHUNKS_EVENT } from "slot-watch-common";

const { upgradeWebSocket, websocket } = createBunWebSocket<ServerWebSocket>();

const app = new Hono();

app.get(
	"/watch",
	upgradeWebSocket((c) => {
		return {
			async onOpen(e, ws) {
				const rawWs = ws.raw as ServerWebSocket;
				rawWs.subscribe(CHUNKS_EVENT);
				rawWs.subscribe(BURN_BLOCKS_EVENT);
			},
			// async message(ws, message) {},
			async onClose(evt, ws) {
				const rawWs = ws.raw as ServerWebSocket;
				rawWs.unsubscribe(CHUNKS_EVENT);
				rawWs.unsubscribe(BURN_BLOCKS_EVENT);
			},
		};
	}),
);

app.route("*", eventsRoutes);

app.get("/", (c) => c.text("Hello World"));

console.log("Listening on http://localhost:1080");

export default {
	port: 1080,
	fetch: app.fetch,
	websocket,
};
