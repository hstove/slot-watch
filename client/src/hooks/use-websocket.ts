import type { WSPayload } from 'slot-watch-common';
import { useEffect } from 'react';
import { useEventSource } from 'react-use-websocket';
import { allPayloadsSetterAtom } from '@/store/chunks-store';
import { useAtomCallback } from 'jotai/utils';
import React from 'react';
import { networkIdAtom } from '@/store/network';
import { slotsApiUrl } from '@/lib/slots-api';
import { useAtomValue } from 'jotai';

type UseWebSocketProps = {
  networkKey?: string;
};

export const useChunksWatcher = () => {
  const { lastMessage } = useWebSocket();
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
  const didUnmount = React.useRef(false);
  const networkId = useAtomValue(networkIdAtom);
  // const wsUrl = `${slotsWsUrl}/watch/${networkId}`;
  const wsUrl = `${slotsApiUrl}/stream/${networkId}`;
  const { lastEvent: lastMessage, readyState } = useEventSource(wsUrl, {
    reconnectAttempts: 10,
    reconnectInterval: 1000,
    shouldReconnect: (_closeEvent) => {
      return !didUnmount.current;
    },
    retryOnError: true,
    // events: {
    //   message: (event) => {
    //     console.log('useWebSocket: Received message', event);
    //   },
    // },
  });
  // const { lastMessage, readyState, sendMessage } = _useWebSocket(wsUrl, {
  //   heartbeat: {
  //     interval: 10000,
  //     message: 'ping',
  //     timeout: 60000,
  //     returnMessage: 'pong',
  //   },
  //   reconnectAttempts: 10,
  //   reconnectInterval: 1000,
  //   shouldReconnect: (_closeEvent) => {
  //     return !didUnmount.current;
  //   },
  // });

  React.useEffect(() => {
    return () => {
      didUnmount.current = true;
    };
  }, []);

  return {
    readyState,
    lastMessage,
    // sendMessage,
  };
};
