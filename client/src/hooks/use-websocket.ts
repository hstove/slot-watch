import { useEventSource } from 'react-use-websocket';
import React from 'react';
import { networkIdAtom } from '@/store/network';
import { slotsStreamerUrl } from '@/lib/slots-api';
import { useAtomValue } from 'jotai';

export const useWebSocket = () => {
  const didUnmount = React.useRef(false);
  const networkId = useAtomValue(networkIdAtom);
  // const wsUrl = `${slotsWsUrl}/watch/${networkId}`;
  const wsUrl = `${slotsStreamerUrl}/stream/${networkId}`;
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
