import { RecentSigners } from '@/components/recent-signers';
import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import { zodValidator } from '@tanstack/zod-adapter';
import { getRecentSigners } from '@/lib/slots-api';

const basicSearchSchema = z.object({
  network: z.string().optional().default('mainnet'),
});

export const Route = createFileRoute('/signers')({
  component: () => <RecentSigners />,
  validateSearch: zodValidator(basicSearchSchema),
  loaderDeps: ({ search: { network } }) => {
    return { network };
  },
  loader: async ({ deps: { network } }) => {
    const [signers] = await Promise.all([getRecentSigners(network)]);
    return { signers, network };
  },
});
