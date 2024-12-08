import React from 'react';
import { useAtomValue, useSetAtom } from 'jotai';
import {
  allSignerLatestResponsesAtom,
  signerLatestResponsesMapAtom,
} from '@/store/blocks-store';
import { networkIdAtom } from '@/store/network';
import { useWatchExtend } from '@/hooks/use-watch-extend';

export function WhenExtend() {
  const init = useSetAtom(allSignerLatestResponsesAtom);
  const networkKey = useAtomValue(networkIdAtom);
  useWatchExtend();
  // biome-ignore lint/correctness/useExhaustiveDependencies(networkKey): <explanation>
  React.useEffect(() => {
    init();
  }, [init, networkKey]);

  const responses = useAtomValue(signerLatestResponsesMapAtom);

  return <div>{responses.size}</div>;
}
