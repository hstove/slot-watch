/** biome-ignore-all lint/style/useFilenamingConvention: allowed */
import { getBtcBlock, getSigners } from '@/lib/slots-api';
import { createFileRoute } from '@tanstack/react-router';
import { BtcBlock } from './-components/btc-block';
import { validateSearch } from '@/lib/search-schema';

export const Route = createFileRoute('/btc-blocks/$heightOrHash')({
  component: BtcBlock,
  validateSearch,
  loaderDeps: ({ search: { network } }) => {
    return { network };
  },
  loader: async ({ params: { heightOrHash }, deps: { network } }) => {
    const [{ btcBlock, miner }, signers] = await Promise.all([
      getBtcBlock(network ?? 'mainnet', heightOrHash),
      getSigners(network ?? 'mainnet'),
    ]);
    if (!btcBlock) {
      throw new Error('BTC block not found');
    }
    return { btcBlock, miner: miner ?? null, signers, network };
  },
});
