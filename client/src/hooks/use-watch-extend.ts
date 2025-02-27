import { useWebSocket } from './use-websocket';
import {
  BLOCK_RESPONSE_EVENT,
  decodeChunkMaybe,
  recoverChunkPublicKey,
  SignerMessageTypePrefix,
  type WSPayload,
} from 'slot-watch-common';
import React from 'react';
import { useAtomCallback } from 'jotai/utils';
import { networkIdAtom } from '@/store/network';
// import { signerLatestResponsesMapAtom } from '@/store/blocks-store';
import { setSignerLatestResponsesAtom } from '@/store/responses-store';
import { hex } from '@scure/base';
import type { ApiBlockResponseForBlock } from '@/lib/slots-api';

export const useWatchExtend = () => {
  const { lastMessage, readyState } = useWebSocket();
  // const networkId = useAtomValue(networkIdAtom);

  // useEffect(() => {
  //   if (networkId) {
  //     sendMessage(
  //       JSON.stringify({
  //         type: 'subscribe',
  //         networkKey: networkId,
  //       }),
  //     );
  //   }
  // }, [networkId, sendMessage]);

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
        if (payload.type === BLOCK_RESPONSE_EVENT) {
          const response = payload.payload;
          set(setSignerLatestResponsesAtom, {
            ...response,
          });
        }
        // set(allPayloadsSetterAtom, payload);
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
