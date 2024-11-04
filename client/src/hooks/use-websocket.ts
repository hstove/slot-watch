import type { WSPayload } from 'slot-watch-common';
import { useEffect } from 'react';
import _useWebSocket from 'react-use-websocket';
import { allPayloadsSetterAtom } from '@/store/chunks-store';
import { useAtomCallback } from 'jotai/utils';
import React from 'react';
import { networkIdAtom } from '@/store/network';
import { slotsWsUrl } from '@/lib/slots-api';
import { useAtomValue } from 'jotai';

type UseWebSocketProps = {
  networkKey?: string;
};

export const useChunksWatcher = () => {
  const { lastMessage, readyState, sendMessage } = useWebSocket();
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
        set(allPayloadsSetterAtom, payload);
      } catch (error) {
        console.debug('Error parsing message', error);
      }
    }, []),
  );

  useEffect(() => {
    handleMessage(lastMessage);
  }, [lastMessage, handleMessage]);
};

export const useWebSocket = () => {
  const networkId = useAtomValue(networkIdAtom);
  const wsUrl = `${slotsWsUrl}/watch/${networkId}`;
  const { lastMessage, readyState, sendMessage } = _useWebSocket(wsUrl, {
    heartbeat: {
      interval: 10000,
      message: 'ping',
      timeout: 60000,
      returnMessage: 'pong',
    },
  });

  return {
    readyState,
    lastMessage,
    sendMessage,
  };
};
