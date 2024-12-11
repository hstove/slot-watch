import { Blocks } from '@/components/blocks-v2/blocks';
import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import { zodValidator } from '@tanstack/zod-adapter';
import { getBurnBlocks, getSigners } from '@/lib/slots-api';

const basicSearchSchema = z.object({
  network: z.string().optional(),
});

export const Route = createFileRoute('/')({
  component: () => <Blocks />,
  validateSearch: zodValidator(basicSearchSchema),
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
