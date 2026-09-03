import React from 'react';
import { Route } from '@/routes/blocks/index';
import {
  loadMoreBurnBlocksAtom,
  setAllBurnBlocksAtom,
  sortedBurnBlocksAtom,
} from '@/store/blocks-store';
import { BurnBlock } from './burn-block';
import { useAtomValue, useSetAtom } from 'jotai';
import { setSignersApiAtom } from '@/store/signers-store';
import { BlockModal } from '../block/block-modal';
import { Button } from '../ui/button';

const BurnBlocksLoadMore = () => {
  const loadMoreBurnBlocks = useSetAtom(loadMoreBurnBlocksAtom);

  return (
    <div className="flex justify-center pb-4">
      <Button
        variant="outline"
        onClick={async () => await loadMoreBurnBlocks()}
      >
        {'Load more'}
      </Button>
    </div>
  );
};

export function Blocks() {
  const loaderData = Route.useLoaderData();
  const burnBlocks = useAtomValue(sortedBurnBlocksAtom);
  const setBurnBlocks = useSetAtom(setAllBurnBlocksAtom);
  const setSigners = useSetAtom(setSignersApiAtom);

  React.useEffect(() => {
    setBurnBlocks(loaderData.burnBlocks);
    setSigners(loaderData.signers, loaderData.network ?? 'mainnet');
  }, [loaderData, setBurnBlocks, setSigners]);

  return (
    <div className="flex flex-col gap-4 w-full">
      {burnBlocks.map((b) => (
        <BurnBlock
          burnBlockHash={b.burnBlockHash}
          key={b.burnBlockHash}
          consensusHash={b.consensusHash}
        />
      ))}
      <React.Suspense>
        <BurnBlocksLoadMore />
      </React.Suspense>
      <BlockModal />
    </div>
  );
}
