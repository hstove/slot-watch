/** biome-ignore-all lint/style/useFilenamingConvention: allowed */
import { createFileRoute } from '@tanstack/react-router';
import {
  getBurnBlocks,
  getMinerCommits,
  getMinerDetail,
  getMinerEconomicsMiners,
} from '@/lib/slots-api';
import { validateSearch } from '@/lib/search-schema';
import { MAX_COMMIT_BLOCKS, MINER_WINDOWS } from '@/lib/miner-economics';
import { MinerDetail } from '@/components/miners/miner-detail';

const DETAIL_WINDOW = MINER_WINDOWS['28d'];

async function loadEconomics(networkKey: string) {
  try {
    const { burnBlocks } = await getBurnBlocks(networkKey);
    const tip = burnBlocks[0]?.burnBlockHeight ?? 0;
    const fromHeight = Math.max(0, tip - DETAIL_WINDOW.blocks + 1);
    const [economics, commits] = await Promise.all([
      getMinerEconomicsMiners(networkKey, fromHeight, tip),
      getMinerCommits(
        networkKey,
        Math.max(fromHeight, tip - MAX_COMMIT_BLOCKS + 1),
        tip
      ),
    ]);
    const maturedTo = Math.min(tip, economics.maturedThroughHeight);
    const matured =
      maturedTo >= fromHeight
        ? await getMinerEconomicsMiners(networkKey, fromHeight, maturedTo)
        : null;
    return { tip, fromHeight, economics, matured, commits };
  } catch {
    return null;
  }
}

export const Route = createFileRoute('/miners/$publicKey')({
  component: MinerDetailPage,
  validateSearch,
  loaderDeps: ({ search: { network } }) => {
    return { network };
  },
  loader: async ({ params: { publicKey }, deps: { network } }) => {
    const networkKey = network ?? 'mainnet';
    const [minerDetail, economics] = await Promise.all([
      getMinerDetail(networkKey, publicKey),
      loadEconomics(networkKey),
    ]);
    return { minerDetail, economics, networkKey };
  },
});

function MinerDetailPage() {
  const { minerDetail, economics, networkKey } = Route.useLoaderData();

  return (
    <MinerDetail
      minerDetail={minerDetail}
      economics={economics}
      networkKey={networkKey}
    />
  );
}
