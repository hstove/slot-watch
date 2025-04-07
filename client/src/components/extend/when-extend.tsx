import React from 'react';
import { useAtomValue, useSetAtom } from 'jotai';
import {
  fetchSignersLatestResponsesAtom,
  mostRecentTenureChangeAtom,
  tenureChangesWriterAtom,
  whenExtendAtom,
} from '@/store/responses-store';
import { ExtendSigners } from './extend-signers';
import { ExtendSignersTable } from './extend-signers-table';
import { ConnectionStatus } from '../connection-status';
import { Clock } from '../clock';
import { Route } from '@/routes/when-extend';
import { setSignersApiAtom } from '@/store/signers-store';
import { loadable } from 'jotai/utils';
import { Countdown } from '../countdown';
import { useWatchBlocks } from '@/hooks/use-watch-blocks';
import { Timestamp } from '../timestamp';

export function WhenExtend() {
  const loaderData = Route.useLoaderData();
  // const init = useSetAtom(setSignerLatestResponsesAtom);
  useAtomValue(loadable(fetchSignersLatestResponsesAtom));
  const { readyState } = useWatchBlocks();
  const setSigners = useSetAtom(setSignersApiAtom);
  const setTenureChanges = useSetAtom(tenureChangesWriterAtom);

  React.useEffect(() => {
    setSigners(loaderData.signers, loaderData.network ?? 'mainnet');
    setTenureChanges(loaderData.tenureChanges);
  }, [loaderData, setSigners, setTenureChanges]);
  // // biome-ignore lint/correctness/useExhaustiveDependencies(networkKey): <explanation>
  // React.useEffect(() => {
  //   init();
  // }, [init, networkKey]);

  const whenExtend = useAtomValue(whenExtendAtom);
  const mostRecentTenureChange = useAtomValue(mostRecentTenureChangeAtom);

  return (
    <div className="w-full flex flex-col gap-0 min-h-screen">
      <div className="flex flex-1 flex-col gap-7">
        <div className="grid grid-cols-2 auto-rows-fr">
          <div className="flex flex-col gap-2">
            <div className="text-3xl">
              {whenExtend ? <Countdown date={whenExtend} /> : 'N/A'}
            </div>
            <div className="text-xl">
              {whenExtend ? (
                <Timestamp timestamp={whenExtend} showMillis={false} />
              ) : null}
            </div>
            <div className="text-lg text-muted-foreground">
              Next tenure extend
            </div>
          </div>
          <div className="flex flex-col gap-2">
            <div className="flex-1" />
            <div className="text-xl">
              {mostRecentTenureChange ? (
                <Timestamp
                  timestamp={new Date(mostRecentTenureChange).toISOString()}
                  showMillis={false}
                />
              ) : null}
            </div>

            <div className="text-lg text-muted-foreground">
              Last tenure change
            </div>
          </div>
        </div>
        {/* <div className="w-full flex my-10 gap-3 flex-col">
          <div className="w-full text-center text-xl">Next tenure extend:</div>
          <div className="w-full max-w-72 text-center mx-auto text-5xl">
            {whenExtend ? <Countdown date={whenExtend} /> : 'N/A'}
          </div>
        </div> */}
        <div className="w-full flex flex-col gap-7 mb-10">
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
