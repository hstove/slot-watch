import App from '@/App';
import { createRootRoute, retainSearchParams } from '@tanstack/react-router';
import { z } from 'zod';
import { zodValidator } from '@tanstack/zod-adapter';

const basicSearchSchema = z.object({
  network: z.string().optional(),
});

export const Route = createRootRoute({
  component: () => <App />,
  validateSearch: zodValidator(basicSearchSchema),
  search: {
    middlewares: [retainSearchParams(['network'])],
  },
  loaderDeps: ({ search: { network } }) => {
    return { network };
  },
  loader: ({ deps: { network } }) => {
    return { network };
  },
});
