import { Hono } from "hono";
import { logger } from "hono/logger";
import eventsRoutes, { getBunServer } from "./routes/events.routes";
import { createBunWebSocket } from "hono/bun";
import type { ServerWebSocket } from "bun";
import {
	BURN_BLOCKS_EVENT,
	CHUNKS_EVENT,
	MANY_CHUNKS_EVENT,
	NEW_BLOCK_EVENT,
} from "slot-watch-common";
import { getBlockRoute } from "./routes/get-block.routes";

const { upgradeWebSocket, websocket } = createBunWebSocket<ServerWebSocket>();

const app = new Hono();

app.use(logger());

app.get(
	"/watch",
	upgradeWebSocket((c) => {
		return {
			async onOpen(e, ws) {
				const rawWs = ws.raw as ServerWebSocket;
				rawWs.subscribe(CHUNKS_EVENT);
				rawWs.subscribe(BURN_BLOCKS_EVENT);
				rawWs.subscribe(NEW_BLOCK_EVENT);
				rawWs.subscribe(MANY_CHUNKS_EVENT);
			},
			// async message(ws, message) {},
			async onClose(evt, ws) {
				const rawWs = ws.raw as ServerWebSocket;
				rawWs.unsubscribe(CHUNKS_EVENT);
				rawWs.unsubscribe(BURN_BLOCKS_EVENT);
				rawWs.unsubscribe(NEW_BLOCK_EVENT);
				rawWs.unsubscribe(MANY_CHUNKS_EVENT);
			},
		};
	}),
);

app.get("/", (c) => c.text("Hello World"));

app.route("/", eventsRoutes);

app.route("/", getBlockRoute);

app.notFound((c) => {
	console.log(`${c.req.method} ${c.req.url} not found`);
	return c.text("Not Found", 200);
});

console.log("Listening on http://localhost:1080");

export default {
	port: 1080,
	fetch: app.fetch,
	websocket,
};
