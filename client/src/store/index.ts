import type { WSPayload } from "slot-watch-common";
import { create } from "zustand";

export const useChunksStore = create<{
	chunks: WSPayload[];
	addChunk: (chunk: WSPayload) => void;
	pingTimeout?: number;
	setPingTimeout: (timeout: number) => void;
}>((set) => ({
	chunks: [],
	addChunk: (chunk: WSPayload) =>
		set((state) => ({ chunks: [...state.chunks, chunk] })),
	setPingTimeout: (timeout: number) => set({ pingTimeout: timeout }),
}));
