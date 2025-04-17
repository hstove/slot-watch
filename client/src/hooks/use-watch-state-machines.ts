import { useWebSocket } from './use-websocket';
import {
  BLOCK_RESPONSE_EVENT,
  STATE_MACHINE_UPDATE_EVENT,
  type WSPayload,
} from 'slot-watch-common';
import React from 'react';
import { useAtomCallback } from 'jotai/utils';
import { networkIdAtom } from '@/store/network';
// import { signerLatestResponsesMapAtom } from '@/store/blocks-store';
import { setLatestStateMachinesAtom } from '@/store/state-machine-store';
import { useAtomValue } from 'jotai';

export const useWatchStateMachines = () => {
  const { lastMessage, readyState } = useWebSocket();
  const handleMessage = useAtomCallback(
    // biome-ignore lint/suspicious/noExplicitAny: <explanation>
    React.useCallback((get, set, message: MessageEvent<any> | null) => {
      if (message === null) return;
      const networkId = get(networkIdAtom);
      try {
        const payload = JSON.parse(message.data) as WSPayload;
        if (payload.networkKey !== networkId) {
          console.warn(
            `Websocket: Received unexpected networkKey: ${payload.networkKey}`,
          );
          return;
        }
        if (payload.type === STATE_MACHINE_UPDATE_EVENT) {
          set(setLatestStateMachinesAtom, payload.payload);
        }
      } catch (error) {
        console.debug('Error parsing message', error);
      }
    }, []),
  );

  React.useEffect(() => {
    handleMessage(lastMessage);
  }, [lastMessage, handleMessage]);

  return {
    readyState,
  };
};
