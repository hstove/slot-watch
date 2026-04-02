import { createFileRoute } from '@tanstack/react-router';
import { getRecentSigners, getStateMachineHistory } from '@/lib/slots-api';
import { validateSearch } from '@/lib/search-schema';
import { StateMachineHistory } from '@/components/state-machines/state-machine-history';

export const Route = createFileRoute('/state-machine-history')({
  component: () => <StateMachineHistory />,
  validateSearch,
  loaderDeps: ({ search: { network } }) => {
    return { network };
  },
  loader: async ({ deps: { network } }) => {
    const networkKey = network ?? 'mainnet';
    const [signers, history] = await Promise.all([
      getRecentSigners(networkKey),
      getStateMachineHistory(networkKey),
    ]);
    return { signers, history, network };
  },
});
