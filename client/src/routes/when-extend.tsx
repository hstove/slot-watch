import { WhenExtend } from '@/components/extend/when-extend';
import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import { zodValidator } from '@tanstack/zod-adapter';
import { getBurnBlocks, getSigners } from '@/lib/slots-api';

const basicSearchSchema = z.object({
  network: z.string().optional(),
});

export const Route = createFileRoute('/when-extend')({
  component: () => <WhenExtend />,
  validateSearch: zodValidator(basicSearchSchema),
  loaderDeps: ({ search: { network } }) => {
    return { network };
  },
  loader: async ({ deps: { network } }) => {
    const [signers] = await Promise.all([getSigners(network ?? 'mainnet')]);
    return { network, signers };
  },
});
