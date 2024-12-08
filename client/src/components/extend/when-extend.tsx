import React from 'react';
import { useAtomValue, useSetAtom } from 'jotai';
import {
  allSignerLatestResponsesAtom,
  signerLatestResponsesMapAtom,
  sortedLatestResponsesAtom,
  whenExtendAtom,
} from '@/store/blocks-store';
import { networkIdAtom } from '@/store/network';
import { useWatchExtend } from '@/hooks/use-watch-extend';
import { ExtendSigners } from './extend-signers';

export function WhenExtend() {
  const init = useSetAtom(allSignerLatestResponsesAtom);
  const networkKey = useAtomValue(networkIdAtom);
  useWatchExtend();
  // biome-ignore lint/correctness/useExhaustiveDependencies(networkKey): <explanation>
  React.useEffect(() => {
    init();
  }, [init, networkKey]);

  const responses = useAtomValue(sortedLatestResponsesAtom);
  const whenExtend = useAtomValue(whenExtendAtom);

  return (
    <div className="w-full flex flex-col gap-5">
      <div className="w-full max-w-72 text-center mx-auto">
        {whenExtend ?? 'N/A'}
      </div>
      <ExtendSigners />
    </div>
  );
}
