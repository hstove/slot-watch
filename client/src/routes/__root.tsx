import App from '@/App';
import { createRootRoute, Link, Outlet } from '@tanstack/react-router';
import { TanStackRouterDevtools } from '@tanstack/router-devtools';
import { z } from 'zod';
import { zodValidator } from '@tanstack/zod-adapter';

const basicSearchSchema = z.object({
  network: z.string().optional(),
});

export const Route = createRootRoute({
  component: () => <App />,
  validateSearch: zodValidator(basicSearchSchema),
  loaderDeps: ({ search: { network } }) => {
    return { network };
  },
  loader: ({ deps: { network } }) => {
    return { network };
  },
});
