import { BlocksList } from '@/components/blocks/blocks-list';
import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/blocks')({
  component: () => <BlocksList />,
});
