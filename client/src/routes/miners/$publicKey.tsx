/** biome-ignore-all lint/style/useFilenamingConvention: allowed */
import { createFileRoute } from '@tanstack/react-router';
import { getMinerStats } from '@/lib/slots-api';
import { validateSearch } from '@/lib/search-schema';
import { PublicKey } from '@/components/public-key';
import { textStyles } from '@/lib/text-variants';
import { DataLabel, DataValue } from '@/components/data-group';

export const Route = createFileRoute('/miners/$publicKey')({
  component: MinerDetailPage,
  validateSearch,
  loaderDeps: ({ search: { network } }) => {
    return { network };
  },
  loader: async ({ params: { publicKey }, deps: { network } }) => {
    const networkKey = network ?? 'mainnet';
    const minerStats = await getMinerStats(networkKey);
    const miner = minerStats.miners.find((m) => m.publicKey === publicKey);
    return { publicKey, miner, network: networkKey };
  },
});

function MinerDetailPage() {
  const { publicKey, miner, network } = Route.useLoaderData();

  return (
    <div className="container mx-auto px-4 py-6">
      <div className="flex flex-col gap-6">
        <h1 className={textStyles('h1', 'pb-0 mb-0')}>Miner</h1>

        <div className="space-y-3">
          <div className="grid gap-3 grid-cols-[minmax(140px,min-content)_1fr] items-center">
            <DataLabel>Public Key</DataLabel>
            <DataValue>
              <PublicKey publicKey={publicKey} />
            </DataValue>

            {miner && (
              <>
                <DataLabel>Blocks Won (last 500)</DataLabel>
                <DataValue>
                  {miner.count} ({((miner.count / 500) * 100).toFixed(1)}%)
                </DataValue>

                <DataLabel>Last Tenure (BTC Block)</DataLabel>
                <DataValue>{miner.latestBlock.toLocaleString()}</DataValue>

                <DataLabel>Version</DataLabel>
                <DataValue>{miner.version || 'Unknown'}</DataValue>
              </>
            )}

            {!miner && (
              <>
                <DataLabel>Status</DataLabel>
                <DataValue>
                  Miner not found in recent blocks (last 500)
                </DataValue>
              </>
            )}
          </div>
        </div>

        <div className="text-sm text-muted-foreground">
          More detailed miner statistics coming soon.
        </div>
      </div>
    </div>
  );
}
