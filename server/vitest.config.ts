import { defineWorkersConfig } from '@cloudflare/vitest-pool-workers/config';

export default defineWorkersConfig({
  test: {
    globals: true,
    // Tests that import `bun:test` run under `bun test`, not the workers pool.
    // They cover logic whose import graph the pool can't load (the
    // `slot-watch-common` codec pulls in `@noble/*` subpath exports and, via
    // `@clarigen/core`, socket.io).
    exclude: [
      '**/node_modules/**',
      'tests/convert-block.test.ts',
      'tests/pre-commits.test.ts',
    ],
    poolOptions: {
      workers: {
        wrangler: { configPath: '../server-wrangler.jsonc' },
        main: './tests/test-worker.ts',
      },
    },
    deps: {
      optimizer: {
        ssr: {
          enabled: true,
          include: [
            '@noble/hashes/sha512',
            '@noble/hashes/hmac',
            '@noble/hashes/utils',
            // '@stacks/transactions',
            // 'https',
          ],
        },
      },
    },
  },
});
