import React from 'react';
import { Route } from '@/routes/blocks-v2';
import { useHydrateAtoms } from 'jotai/utils';
import { allBurnBlocksAtom, setAllBurnBlocksAtom } from '@/store/blocks-store';
import { atomEffect } from 'jotai-effect';
import { networkIdAtom } from '@/store/network';
import { BurnBlock } from './burn-block';
import { useAtomValue, useSetAtom } from 'jotai';

export function Blocks() {
  const loaderData = Route.useLoaderData();
  const burnBlocks = useAtomValue(allBurnBlocksAtom);
  const setBurnBlocks = useSetAtom(setAllBurnBlocksAtom);
  // biome-ignore lint/correctness/useExhaustiveDependencies: <explanation>
  React.useEffect(() => {
    setBurnBlocks(loaderData.burnBlocks);
  }, []);
  return (
    <div className="flex flex-col gap-4 w-full">
      {burnBlocks.map((b) => (
        <BurnBlock burnBlockHash={b.burnBlockHash} key={b.burnBlockHash} />
      ))}
    </div>
  );
}
