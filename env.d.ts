/// <reference types="./env.d.ts" />
import type { worker } from './alchemy.run';

export type WorkerEnv = typeof worker.Env;

declare module 'cloudflare:workers' {
  // biome-ignore lint/style/noNamespace: ignored using `--suppress`
  namespace Cloudflare {
    export interface Env extends WorkerEnv {}
  }
}
