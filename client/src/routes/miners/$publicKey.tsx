/** biome-ignore-all lint/style/useFilenamingConvention: allowed */
import { createFileRoute } from '@tanstack/react-router';
import { getMinerDetail } from '@/lib/slots-api';
import { validateSearch } from '@/lib/search-schema';
import { MinerDetail } from '@/components/miners/miner-detail';

export const Route = createFileRoute('/miners/$publicKey')({
  component: MinerDetailPage,
  validateSearch,
  loaderDeps: ({ search: { network } }) => {
    return { network };
  },
  loader: async ({ params: { publicKey }, deps: { network } }) => {
    const networkKey = network ?? 'mainnet';
    const minerDetail = await getMinerDetail(networkKey, publicKey);
    return { minerDetail };
  },
});

function MinerDetailPage() {
  const { minerDetail } = Route.useLoaderData();

  return (
    <div className="container mx-auto px-4 py-6">
      <MinerDetail minerDetail={minerDetail} />
    </div>
  );
}
