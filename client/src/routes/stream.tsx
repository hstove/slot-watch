import { createFileRoute } from '@tanstack/react-router';
import { ChunkWatcher } from '@/components/chunk-watcher';
import { Watcher } from '@/components/stream/watcher';

export const Route = createFileRoute('/stream')({
  component: () => (
    <>
      <ChunkWatcher />
      <Watcher />
    </>
  ),
});

function RouteComponent() {
  return <div>Hello "/stream"!</div>;
}
