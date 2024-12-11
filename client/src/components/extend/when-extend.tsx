import React from 'react';
import { useAtomValue, useSetAtom } from 'jotai';
import {
  fetchSignersLatestResponsesAtom,
  whenExtendAtom,
} from '@/store/responses-store';
import { useWatchExtend } from '@/hooks/use-watch-extend';
import { ExtendSigners } from './extend-signers';
import { ExtendSignersTable } from './extend-signers-table';
import { ConnectionStatus } from '../connection-status';
import { Clock } from '../clock';
import { Route } from '@/routes/when-extend';
import { setSignersApiAtom } from '@/store/signers-store';
import { loadable } from 'jotai/utils';
import { Countdown } from '../countdown';

export function WhenExtend() {
  const loaderData = Route.useLoaderData();
  // const init = useSetAtom(setSignerLatestResponsesAtom);
  useAtomValue(loadable(fetchSignersLatestResponsesAtom));
  const { readyState } = useWatchExtend();
  const setSigners = useSetAtom(setSignersApiAtom);

  React.useEffect(() => {
    setSigners(loaderData.signers, loaderData.network ?? 'mainnet');
  }, [loaderData, setSigners]);
  // // biome-ignore lint/correctness/useExhaustiveDependencies(networkKey): <explanation>
  // React.useEffect(() => {
  //   init();
  // }, [init, networkKey]);

  const whenExtend = useAtomValue(whenExtendAtom);

  return (
    <div className="w-full flex flex-col gap-0 min-h-screen">
      <div className="flex flex-1 flex-col">
        <div className="w-full flex my-10 gap-3 flex-col">
          <div className="w-full text-center text-xl">Next tenure extend:</div>
          <div className="w-full max-w-72 text-center mx-auto text-5xl">
            {whenExtend ? <Countdown date={whenExtend} /> : 'N/A'}
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
