import {
	CHUNKS_EVENT,
	getPayloadId,
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
			console.log(getPayloadId(payload), payload.payload);
			if ("networkKey" in payload && payload.networkKey !== networkKey) {
				return;
			}
			setChunks((prevChunks) => [...prevChunks, payload]);
			newMessageCallback();
		}
	}, [lastMessage, newMessageCallback, networkKey]);

	return {
		chunks,
		readyState,
	};
};
