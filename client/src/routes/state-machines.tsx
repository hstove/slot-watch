import { createFileRoute } from '@tanstack/react-router';
import { getRecentSigners, getStateMachineUpdates } from '@/lib/slots-api';
import { validateSearch } from '@/lib/search-schema';
import { StateMachines } from '@/components/state-machines/state-machines';

export const Route = createFileRoute('/state-machines')({
  component: () => <StateMachines />,
  validateSearch,
  loaderDeps: ({ search: { network } }) => {
    return { network };
  },
  loader: async ({ deps: { network } }) => {
    const [signers, stateMachines] = await Promise.all([
      getRecentSigners(network ?? 'mainnet'),
      getStateMachineUpdates(network ?? 'mainnet'),
    ]);
    return { signers, stateMachines, network };
  },
});
