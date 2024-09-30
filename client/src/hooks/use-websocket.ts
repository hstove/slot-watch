import type { ChunkEvent } from "@/lib/types";
import { useState, useEffect, useCallback, useRef } from "react";

const wsUrl = "wss://slot-watch.fly.dev/watch";

export const useWebSocket = (newMessageCallback: () => void) => {
	const [chunks, setChunks] = useState<ChunkEvent[]>([]);
	const wsRef = useRef<WebSocket | null>(null);
	const reconnectTimeoutRef = useRef<number | null>(null);
	const [reconnectDelay, setReconnectDelay] = useState(1000);

	// biome-ignore lint/correctness/useExhaustiveDependencies: <explanation>
	const connect = useCallback(() => {
		wsRef.current = new WebSocket(wsUrl);

		wsRef.current.onopen = () => {
			console.debug("WebSocket connection opened");
			// Clear any reconnect timeout if connection is successful
			if (reconnectTimeoutRef.current) {
				clearTimeout(reconnectTimeoutRef.current);
				reconnectTimeoutRef.current = null;
			}
			setReconnectDelay(1000);
		};

		wsRef.current.onmessage = (event) => {
			const chunk = JSON.parse(event.data);
			// const isScrolled = isScrolledToBottom();
			newMessageCallback();
			setChunks((prevChunks) => [...prevChunks, chunk]);
			// if (isScrolled) {
			//   setTimeout(() => {
			//     scrollToBottom();
			//   }, 200);
			// }
		};

		wsRef.current.onclose = (_event) => {
			console.debug("WebSocket connection closed");
			// Attempt to reconnect
			reconnect();
		};

		wsRef.current.onerror = (error) => {
			console.debug("WebSocket error:", error);
		};
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [newMessageCallback, setReconnectDelay]);

	const reconnect = useCallback(() => {
		// Implement exponential backoff
		const delay = Math.min(
			30000,
			// reconnectTimeoutRef.current ? reconnectTimeoutRef.current * 2 : 1000,
			reconnectDelay * 2,
		);
		console.debug(`Attempting to reconnect in ${delay}ms`);

		// reconnectTimeoutRef.current = window.setTimeout(() => {
		// 	console.debug("Attempting to reconnect...");
		// 	connect();
		// }, delay);
	}, [reconnectDelay]);

	useEffect(() => {
		connect();

		return () => {
			if (wsRef.current) {
				wsRef.current.close();
			}
			if (reconnectTimeoutRef.current) {
				clearTimeout(reconnectTimeoutRef.current);
			}
		};
	}, [connect]);

	return chunks;
};
