import { Timeline } from '@/components/timeline/timeline';
import { getBurnBlocks, getSigners } from '@/lib/slots-api';
import { validateSearch } from '@/lib/search-schema';
import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/')({
  component: Timeline,
  validateSearch,
  loaderDeps: ({ search: { network } }) => ({ network }),
  loader: async ({ deps: { network } }) => {
    const networkKey = network ?? 'mainnet';
    const [{ burnBlocks }, signers] = await Promise.all([
      getBurnBlocks(networkKey),
      getSigners(networkKey),
    ]);
    return { burnBlocks, network, signers };
  },
});
