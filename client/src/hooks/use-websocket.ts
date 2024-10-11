import {
	CHUNKS_EVENT,
	type ChunkEvent,
	type WSPayload,
} from "slot-watch-common";
import { useState, useEffect, useCallback, useRef } from "react";
import _useWebSocket, { ReadyState } from "react-use-websocket";

const wsUrl = "wss://slot-watch.fly.dev/watch";

type UseWebSocketProps = {
	newMessageCallback: () => void;
	networkKey?: string;
};

export const useWebSocket = ({
	newMessageCallback,
	networkKey,
}: UseWebSocketProps) => {
	const [chunks, setChunks] = useState<WSPayload[]>([]);

	const { lastMessage, readyState } = _useWebSocket(wsUrl);

	useEffect(() => {
		if (lastMessage) {
			const payload = JSON.parse(lastMessage.data) as WSPayload;
			if ("networkKey" in payload && payload.networkKey !== networkKey) {
				return;
			}
			newMessageCallback();
			setChunks((prevChunks) => [...prevChunks, payload]);
			// let chunk: ChunkEvent | null = null;
			// if ("type" in payload && payload.type === CHUNKS_EVENT) {
			// 	chunk = payload.payload;
			// }
			// if ("data" in payload) {
			// 	chunk = payload;
			// }
			// if (chunk) {
			// 	newMessageCallback();
			// 	setChunks((prevChunks) => [...prevChunks, chunk]);
			// }
		}
	}, [lastMessage, newMessageCallback, networkKey]);

	return {
		chunks,
		readyState,
	};
};
