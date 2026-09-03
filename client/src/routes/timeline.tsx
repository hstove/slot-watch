import { validateSearch } from '@/lib/search-schema';
import { createFileRoute, redirect } from '@tanstack/react-router';

export const Route = createFileRoute('/timeline')({
  validateSearch,
  beforeLoad: ({ search }) => {
    throw redirect({ to: '/', search });
  },
});
