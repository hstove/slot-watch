import { Blocks } from '@/components/blocks-v2/blocks';
import { createFileRoute } from '@tanstack/react-router';
import { getBurnBlocks, getSigners } from '@/lib/slots-api';
import { validateSearch } from '@/lib/search-schema';

export const Route = createFileRoute('/')({
  component: () => <Blocks />,
  validateSearch,
  loaderDeps: ({ search: { network } }) => {
    return { network };
  },
  loader: async ({ deps: { network } }) => {
    const [{ burnBlocks }, signers] = await Promise.all([
      getBurnBlocks(network ?? 'mainnet'),
      getSigners(network ?? 'mainnet'),
    ]);
    return { burnBlocks, network, signers };
  },
});
