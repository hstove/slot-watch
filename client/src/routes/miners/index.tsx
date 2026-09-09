import { createFileRoute } from '@tanstack/react-router';
import {
  getBurnBlocks,
  getMinerCommits,
  getMinerEconomicsMiners,
  getMinerStats,
} from '@/lib/slots-api';
import { validateMinersSearch } from '@/lib/search-schema';
import {
  DEFAULT_MINER_WINDOW,
  MAX_COMMIT_BLOCKS,
  MINER_WINDOWS,
} from '@/lib/miner-economics';
import { Miners } from '@/components/miners/miners';

export const Route = createFileRoute('/miners/')({
  component: Miners,
  validateSearch: validateMinersSearch,
  loaderDeps: ({ search: { network, window } }) => {
    return { network, window };
  },
  loader: async ({ deps: { network, window } }) => {
    const networkKey = network ?? 'mainnet';
    const windowKey = window ?? DEFAULT_MINER_WINDOW;
    const { burnBlocks } = await getBurnBlocks(networkKey);
    const tip = burnBlocks[0]?.burnBlockHeight ?? 0;
    const fromHeight = Math.max(0, tip - MINER_WINDOWS[windowKey].blocks + 1);
    const commitsFrom = Math.max(fromHeight, tip - MAX_COMMIT_BLOCKS + 1);
    const [minerStats, economics, commits] = await Promise.all([
      getMinerStats(networkKey),
      getMinerEconomicsMiners(networkKey, fromHeight, tip),
      getMinerCommits(networkKey, commitsFrom, tip),
    ]);
    // Revenue matures ~100 tenures late; re-query the matured slice so spend
    // and revenue can be compared over the same blocks.
    const maturedTo = Math.min(tip, economics.maturedThroughHeight);
    const matured =
      maturedTo >= fromHeight
        ? await getMinerEconomicsMiners(networkKey, fromHeight, maturedTo)
        : null;
    return {
      networkKey,
      windowKey,
      tip,
      fromHeight,
      minerStats,
      economics,
      matured,
      commits,
    };
  },
});
