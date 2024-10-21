import {
	CHUNKS_EVENT,
	getPayloadId,
	type ChunkEvent,
	type WSPayload,
} from "slot-watch-common";
import { useState, useEffect, useCallback, useRef } from "react";
import _useWebSocket, { ReadyState } from "react-use-websocket";
import { useSetAtom } from "jotai";
import { allChunksStore } from "@/store/chunks-store";

const wsUrl = "wss://slot-watch.fly.dev/watch";

type UseWebSocketProps = {
	networkKey?: string;
};

export const useChunksWatcher = () => {
	const { lastMessage, readyState } = useWebSocket();
	// const addChunk = useChunksStore((state) => state.addChunk);
	const addChunk = useSetAtom(allChunksStore);

	useEffect(() => {
		if (lastMessage) {
			const payload = JSON.parse(lastMessage.data) as WSPayload;
			// if ("networkKey" in payload && payload.networkKey !== networkKey) {
			// 	return;
			// }
			addChunk(payload);
		}
	}, [lastMessage, addChunk]);
};

export const useWebSocket = () => {
	// const addChunk = useChunksStore((state) => state.addChunk);

	const { lastMessage, readyState } = _useWebSocket(wsUrl);

	// useEffect(() => {
	// 	if (lastMessage) {
	// 		const payload = JSON.parse(lastMessage.data) as WSPayload;
	// 		console.log(getPayloadId(payload), payload.payload);
	// 		if ("networkKey" in payload && payload.networkKey !== networkKey) {
	// 			return;
	// 		}
	// 		addChunk(payload);
	// 	}
	// }, [lastMessage, networkKey, addChunk]);

	return {
		readyState,
		lastMessage,
	};
};
