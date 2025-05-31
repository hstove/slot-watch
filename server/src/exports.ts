export type { SlotWatchServer } from './server';
// import type { app } from "./server";
import { hc } from 'hono/client';
import type { SlotWatchServer } from './server';

const apiClient = hc<SlotWatchServer>('https://slot-watch.fly.dev');
export type ApiClient = typeof apiClient;

export const hcWithType = (...args: Parameters<typeof hc>): ApiClient =>
  hc<SlotWatchServer>(...args);
