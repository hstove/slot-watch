/** biome-ignore-all lint/style/useFilenamingConvention: allowed */
import { createFileRoute } from '@tanstack/react-router';
import {
  type ApiBlockForBurnBlock,
  getBlockResponsesForBlock,
  getBtcBlock,
  getSigners,
  getStacksBlock,
} from '@/lib/slots-api';
import { BtcBlock } from '@/components/btc-block/btc-block';
import { validateSearch } from '@/lib/search-schema';
import { useSetAtom } from 'jotai';
import {
  setAllBurnBlocksAtom,
  setStacksBlocksForBurnBlockFamily,
} from '@/store/blocks-store';
import { setSignersApiAtom } from '@/store/signers-store';
import { useAtomCallback } from 'jotai/utils';
import React from 'react';
import { StacksBlockDetail } from '@/components/stacks-block/stacks-block-detail';

export const Route = createFileRoute('/stx-blocks/$blockHash')({
  component: RouteComponent,
  validateSearch,
  loaderDeps: ({ search: { network } }) => {
    return { network };
  },
  loader: async ({ params: { blockHash }, deps: { network } }) => {
    const networkKey = network ?? 'mainnet';
    // const { btcBlock } = await getBtcBlock(network, blockHash);
    const [responses, stacksBlock, signers] = await Promise.all([
      getBlockResponsesForBlock(networkKey, blockHash),
      getStacksBlock(networkKey, blockHash),
      getSigners(networkKey),
    ]);
    if (!stacksBlock) {
      throw new Error('Stacks block not found');
    }
    return { stacksBlock, responses, signers, network: networkKey };
  },
});

function RouteComponent() {
  const loaderData = Route.useLoaderData();
  const setSigners = useSetAtom(setSignersApiAtom);
  const setStacksBlock = useAtomCallback(
    React.useCallback((_get, set, stacksBlock: ApiBlockForBurnBlock) => {
      set(
        setStacksBlocksForBurnBlockFamily(stacksBlock.consensusHash),
        stacksBlock.consensusHash,
        stacksBlock
      );
    }, [])
  );

  React.useEffect(() => {
    setSigners(loaderData.signers, loaderData.network ?? 'mainnet');
    setStacksBlock(loaderData.stacksBlock);
  }, [loaderData, setSigners, setStacksBlock]);

  return (
    <div className="container mx-auto px-4 py-6">
      <StacksBlockDetail block={loaderData.stacksBlock} />
    </div>
  );
}
