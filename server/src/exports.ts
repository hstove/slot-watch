export type { SlotWatchServer } from './app';
// import type { app } from "./app";
import { hc } from 'hono/client';
import type { SlotWatchServer } from './app';

const apiClient = hc<SlotWatchServer>('https://slot-watch.fly.dev');
export type ApiClient = typeof apiClient;

export const hcWithType = (...args: Parameters<typeof hc>): ApiClient =>
  hc<SlotWatchServer>(...args);
