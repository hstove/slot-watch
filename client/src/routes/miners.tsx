import { createFileRoute } from '@tanstack/react-router';
import { getMinerStats, getRecentSigners } from '@/lib/slots-api';
import { validateSearch } from '@/lib/search-schema';
import { Miners } from '@/components/miners/miners';

export const Route = createFileRoute('/miners')({
  component: Miners,
  validateSearch,
  loaderDeps: ({ search: { network } }) => {
    return { network };
  },
  loader: async ({ deps: { network } }) => {
    const [minerStats] = await Promise.all([
      getMinerStats(network ?? 'mainnet'),
    ]);
    return { minerStats, network };
  },
});
