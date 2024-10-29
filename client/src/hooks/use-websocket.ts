import {
	CHUNKS_EVENT,
	getPayloadId,
	type ChunkEvent,
	type WSPayload,
} from "slot-watch-common";
import { useState, useEffect, useCallback, useRef } from "react";
import _useWebSocket, { ReadyState } from "react-use-websocket";
import { useSetAtom } from "jotai";
import { allChunksStore, allPayloadsSetterAtom } from "@/store/chunks-store";
import { useAtomCallback } from "jotai/utils";
import React from "react";
import { networkIdAtom } from "@/store/network";

const wsUrl = "wss://slot-watch.fly.dev/watch";

type UseWebSocketProps = {
	networkKey?: string;
};

export const useChunksWatcher = () => {
	const { lastMessage, readyState } = useWebSocket();

	const handleMessage = useAtomCallback(
		// biome-ignore lint/suspicious/noExplicitAny: <explanation>
		React.useCallback((get, set, message: MessageEvent<any> | null) => {
			if (message === null) return;
			const networkId = get(networkIdAtom);
			const payload = JSON.parse(message.data) as WSPayload;
			if (payload.networkKey !== networkId) return;
			set(allPayloadsSetterAtom, payload);
		}, []),
	);

	useEffect(() => {
		handleMessage(lastMessage);
	}, [lastMessage, handleMessage]);
};

export const useWebSocket = () => {
	// const addChunk = useChunksStore((state) => state.addChunk);

	const { lastMessage, readyState } = _useWebSocket(wsUrl);

	return {
		readyState,
		lastMessage,
	};
};
