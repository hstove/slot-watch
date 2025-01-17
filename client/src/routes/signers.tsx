import { RecentSigners } from '@/components/recent-signers';
import { createFileRoute } from '@tanstack/react-router';
import { getRecentSigners } from '@/lib/slots-api';
import { validateSearch } from '@/lib/search-schema';

export const Route = createFileRoute('/signers')({
  component: () => <RecentSigners />,
  validateSearch,
  loaderDeps: ({ search: { network } }) => {
    return { network };
  },
  loader: async ({ deps: { network } }) => {
    const [signers] = await Promise.all([
      getRecentSigners(network ?? 'mainnet'),
    ]);
    return { signers, network };
  },
});
