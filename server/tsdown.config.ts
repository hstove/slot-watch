import { defineConfig } from 'tsdown';

export default defineConfig({
  entry: ['src/exports.ts'],
  format: ['esm'],
  sourcemap: true,
  dts: true,
  external: ['cloudflare:workers'],
});
