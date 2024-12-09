import { Blocks } from '@/components/blocks-v2/blocks';
import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import { zodValidator } from '@tanstack/zod-adapter';
import { getBurnBlocks } from '@/lib/slots-api';

const basicSearchSchema = z.object({
  network: z.string().optional().default('mainnet'),
});

export const Route = createFileRoute('/blocks-v2')({
  component: () => <Blocks />,
  validateSearch: zodValidator(basicSearchSchema),
  loaderDeps: ({ search: { network } }) => {
    return { network };
  },
  loader: async ({ deps: { network } }) => {
    const { burnBlocks } = await getBurnBlocks(network);
    return { burnBlocks };
  },
});
