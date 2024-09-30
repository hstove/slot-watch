import type { ChunkEvent } from "slot-watch-common";
import { useState, useEffect, useCallback, useRef } from "react";
import _useWebSocket from "react-use-websocket";

const wsUrl = "wss://slot-watch.fly.dev/watch";

export const useWebSocket = (newMessageCallback: () => void) => {
	const [chunks, setChunks] = useState<ChunkEvent[]>([]);

	const { lastMessage } = _useWebSocket(wsUrl);

	useEffect(() => {
		if (lastMessage) {
			const chunk = JSON.parse(lastMessage.data);
			newMessageCallback();
			setChunks((prevChunks) => [...prevChunks, chunk]);
		}
	}, [lastMessage, newMessageCallback]);

	return chunks;
};
