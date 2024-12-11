import { Blocks } from '@/components/blocks-v2/blocks';
import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import { zodValidator } from '@tanstack/zod-adapter';
import { getBurnBlocks, getSigners } from '@/lib/slots-api';

const basicSearchSchema = z.object({
  network: z.string().optional().default('mainnet'),
});

export const Route = createFileRoute('/blocks')({
  component: () => <Blocks />,
  validateSearch: zodValidator(basicSearchSchema),
  loaderDeps: ({ search: { network } }) => {
    return { network };
  },
  loader: async ({ deps: { network } }) => {
    const [{ burnBlocks }, signers] = await Promise.all([
      getBurnBlocks(network),
      getSigners(network),
    ]);
    return { burnBlocks, network, signers };
  },
});
