import path from 'node:path';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import jotaiDebugLabel from 'jotai/babel/plugin-debug-label';
import jotaiReactRefresh from 'jotai/babel/plugin-react-refresh';
import { TanStackRouterVite } from '@tanstack/router-plugin/vite';
// import { cloudflare } from '@cloudflare/vite-plugin';

export default defineConfig({
  plugins: [
    // cloudflare({
    //   configPath: './wrangler.jsonc',
    // }),
    react({
      babel: {
        plugins: [jotaiDebugLabel, jotaiReactRefresh],
      },
    }),
    TanStackRouterVite(),
  ],
  build: {
    chunkSizeWarningLimit: 1500,
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});
