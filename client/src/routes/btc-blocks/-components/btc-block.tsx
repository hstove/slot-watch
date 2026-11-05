import React from 'react';
import { Route } from '@/routes/btc-blocks/$heightOrHash';
import { BurnBlock } from '@/components/blocks-v2/burn-block';
import { setAllBurnBlocksAtom } from '@/store/blocks-store';
import { setSignersApiAtom } from '@/store/signers-store';
import { useSetAtom } from 'jotai';
import { BlockModal } from '@/components/block/block-modal';

export function BtcBlock() {
  const loaderData = Route.useLoaderData();
  const setSigners = useSetAtom(setSignersApiAtom);
  const setBurnBlocks = useSetAtom(setAllBurnBlocksAtom);

  React.useEffect(() => {
    setSigners(loaderData.signers, loaderData.network ?? 'mainnet');
    setBurnBlocks([loaderData.btcBlock]);
  }, [loaderData, setSigners, setBurnBlocks]);

  return (
    <>
      <BurnBlock
        burnBlockHash={loaderData.btcBlock.burnBlockHash}
        consensusHash={loaderData.btcBlock.consensusHash}
        miner={loaderData.miner}
        alwaysShowBlocks
      />
      <BlockModal />
    </>
  );
}
