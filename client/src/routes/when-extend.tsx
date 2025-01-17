import { WhenExtend } from '@/components/extend/when-extend';
import { createFileRoute } from '@tanstack/react-router';
import { getSigners, getTenureChanges } from '@/lib/slots-api';
import { validateSearch } from '@/lib/search-schema';

export const Route = createFileRoute('/when-extend')({
  component: () => <WhenExtend />,
  validateSearch,
  loaderDeps: ({ search: { network } }) => {
    return { network };
  },
  loader: async ({ deps: { network } }) => {
    const [signers, tenureChanges] = await Promise.all([
      getSigners(network ?? 'mainnet'),
      getTenureChanges(network ?? 'mainnet'),
    ]);
    return { network, signers, tenureChanges };
  },
});
