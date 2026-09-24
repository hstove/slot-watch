/** biome-ignore-all lint/style/useFilenamingConvention: allowed */
import { createFileRoute } from '@tanstack/react-router';
import {
  getBurnBlocks,
  getMinerCommits,
  getMinerDetail,
  getMinerEconomicsMiners,
} from '@/lib/slots-api';
import { validateMinersSearch } from '@/lib/search-schema';
import {
  DEFAULT_MINER_WINDOW,
  MAX_COMMIT_BLOCKS,
  MINER_WINDOWS,
  type MinerWindow,
} from '@/lib/miner-economics';
import { MinerDetail } from '@/components/miners/miner-detail';

async function loadEconomics(networkKey: string, windowKey: MinerWindow) {
  try {
    const { burnBlocks } = await getBurnBlocks(networkKey);
    const tip = burnBlocks[0]?.burnBlockHeight ?? 0;
    const fromHeight = Math.max(0, tip - MINER_WINDOWS[windowKey].blocks + 1);
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
    return { tip, fromHeight, windowKey, economics, matured, commits };
  } catch {
    return null;
  }
}

export const Route = createFileRoute('/miners/$publicKey')({
  component: MinerDetailPage,
  validateSearch: validateMinersSearch,
  loaderDeps: ({ search: { network, window } }) => {
    return { network, window };
  },
  loader: async ({ params: { publicKey }, deps: { network, window } }) => {
    const networkKey = network ?? 'mainnet';
    const windowKey = window ?? DEFAULT_MINER_WINDOW;
    const [minerDetail, economics] = await Promise.all([
      getMinerDetail(networkKey, publicKey),
      loadEconomics(networkKey, windowKey),
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
