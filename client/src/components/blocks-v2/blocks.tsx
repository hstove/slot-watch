import React from 'react';
import { Route } from '@/routes/index';
import { allBurnBlocksAtom, setAllBurnBlocksAtom } from '@/store/blocks-store';
import { BurnBlock } from './burn-block';
import { useAtomValue, useSetAtom } from 'jotai';
import { useWatchBlocks } from '@/hooks/use-watch-blocks';
import { ConnectionStatus } from '../connection-status';
import { Clock } from '../clock';
import { setSignersApiAtom } from '@/store/signers-store';

export function Blocks() {
  const loaderData = Route.useLoaderData();
  const burnBlocks = useAtomValue(allBurnBlocksAtom);
  const setBurnBlocks = useSetAtom(setAllBurnBlocksAtom);
  const setSigners = useSetAtom(setSignersApiAtom);
  const { readyState } = useWatchBlocks();

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
      <div className="sticky bottom-0 w-full flex justify-end p-4 bg-background bg-opacity-50 z-20">
        <Clock className="mr-4" />
        <ConnectionStatus readyState={readyState} />
      </div>
    </div>
  );
}
