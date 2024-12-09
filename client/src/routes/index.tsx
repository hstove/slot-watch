import { RecentSigners } from '@/components/recent-signers';
import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/')({
  component: RecentSigners,
});
