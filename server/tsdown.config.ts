import { defineConfig } from 'tsdown';

export default defineConfig({
  entry: ['src/exports.ts'],
  format: ['esm'],
  sourcemap: true,
  hash: false,
  dts: true,
  external: ['cloudflare:workers'],
});
