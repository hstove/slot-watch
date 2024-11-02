import type { WSPayload } from 'slot-watch-common';
import { useEffect } from 'react';
import _useWebSocket from 'react-use-websocket';
import { allPayloadsSetterAtom } from '@/store/chunks-store';
import { useAtomCallback } from 'jotai/utils';
import React from 'react';
import { networkIdAtom } from '@/store/network';
import { slotsWsUrl } from '@/lib/slots-api';

const wsUrl = `${slotsWsUrl}/watch`;

type UseWebSocketProps = {
  networkKey?: string;
};

export const useChunksWatcher = () => {
  const { lastMessage, readyState } = useWebSocket();

  const handleMessage = useAtomCallback(
    // biome-ignore lint/suspicious/noExplicitAny: <explanation>
    React.useCallback((get, set, message: MessageEvent<any> | null) => {
      if (message === null) return;
      const networkId = get(networkIdAtom);
      try {
        const payload = JSON.parse(message.data) as WSPayload;
        if (payload.networkKey !== networkId) return;
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
  const { lastMessage, readyState } = _useWebSocket(wsUrl, {
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
  };
};
