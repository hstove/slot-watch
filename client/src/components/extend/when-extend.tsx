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
import { ExtendSignersTable } from './extend-signers-table';
import { ConnectionStatus } from '../connection-status';
import { Clock } from '../clock';

export function WhenExtend() {
  const init = useSetAtom(allSignerLatestResponsesAtom);
  const networkKey = useAtomValue(networkIdAtom);
  const { readyState } = useWatchExtend();
  // biome-ignore lint/correctness/useExhaustiveDependencies(networkKey): <explanation>
  React.useEffect(() => {
    init();
  }, [init, networkKey]);

  const responses = useAtomValue(sortedLatestResponsesAtom);
  const whenExtend = useAtomValue(whenExtendAtom);

  return (
    <div className="w-full flex flex-col gap-0 min-h-screen">
      <div className="flex flex-1 flex-col">
        <div className="w-full flex my-10 gap-3 flex-col">
          <div className="w-full text-center text-xl">Next tenure extend:</div>
          <div className="w-full max-w-72 text-center mx-auto text-5xl">
            {whenExtend ?? 'N/A'}
          </div>
        </div>
        <div className="w-full flex flex-col gap-5 mb-10">
          <ExtendSigners />
          <ExtendSignersTable />
        </div>
      </div>
      <div className="sticky bottom-0 w-full flex justify-end p-4 bg-background bg-opacity-50">
        <Clock className="mr-4" />
        <ConnectionStatus readyState={readyState} />
      </div>
    </div>
  );
}
