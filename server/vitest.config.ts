import { defineWorkersConfig } from '@cloudflare/vitest-pool-workers/config';

export default defineWorkersConfig({
  test: {
    globals: true,
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
