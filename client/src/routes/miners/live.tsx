import { createFileRoute } from '@tanstack/react-router';
import { getBurnBlocks, getMinerCommits } from '@/lib/slots-api';
import { validateSearch } from '@/lib/search-schema';
import { LiveCommits } from '@/components/miners/live/live-commits';

/** Enough history to find active miners and compute the 6-block median. */
const RECENT_BLOCKS = 12;

export const Route = createFileRoute('/miners/live')({
  component: LiveCommits,
  validateSearch,
  loader: async () => {
    const { burnBlocks } = await getBurnBlocks('mainnet');
    const tip = burnBlocks[0]?.burnBlockHeight ?? 0;
    const commits = await getMinerCommits(
      'mainnet',
      Math.max(0, tip - RECENT_BLOCKS + 1),
      tip
    );
    return { tip, commits };
  },
});
