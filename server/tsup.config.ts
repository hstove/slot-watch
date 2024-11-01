import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/exports.ts'],
  format: ['esm'],
  sourcemap: true,
  dts: true,
});
