import React from 'react';
import { Route } from '@/routes/index';
import {
  setAllBurnBlocksAtom,
  sortedBurnBlocksAtom,
} from '@/store/blocks-store';
import { BurnBlock } from './burn-block';
import { useAtomValue, useSetAtom } from 'jotai';
import { ConnectionStatus } from '../connection-status';
import { Clock } from '../clock';
import { setSignersApiAtom } from '@/store/signers-store';
import { BlockModal } from '../block/block-modal';

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
          burnBlockHeight={b.burnBlockHeight}
        />
      ))}
      <BlockModal />
    </div>
  );
}
