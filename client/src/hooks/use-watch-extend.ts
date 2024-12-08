import { useWebSocket } from './use-websocket';
import {
  decodeChunkMaybe,
  recoverChunkPublicKey,
  SignerMessageTypePrefix,
  type WSPayload,
} from 'slot-watch-common';
import React from 'react';
import { useAtomCallback } from 'jotai/utils';
import { networkIdAtom } from '@/store/network';
import { signerLatestResponsesMapAtom } from '@/store/blocks-store';
import { hex } from '@scure/base';

export const useWatchExtend = () => {
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
        if (payload.type === 'many_chunks') {
          const signerLatestResponsesMap = get(signerLatestResponsesMapAtom);
          for (const chunk of payload.payload) {
            const publicKey = recoverChunkPublicKey({
              signature: hex.decode(chunk.signature),
              data: hex.decode(chunk.data),
              slotId: chunk.slotId,
              version: chunk.version,
            }).toHex();
            const signer = signerLatestResponsesMap.get(publicKey);
            if (!signer) continue;
            const decoded = decodeChunkMaybe(hex.decode(chunk.data));
            if (decoded?.typeId !== SignerMessageTypePrefix.BlockResponse)
              continue;
            const ts = decoded.data.tenureExtendTimestamp;
            signer.tenureExtendTimestamp = ts
              ? new Date(Number()).toISOString()
              : null;
            signer.createdAt = chunk.createdAt;
            console.log('Updated signer', signer);
            signerLatestResponsesMap.set(publicKey, signer);
          }
          set(signerLatestResponsesMapAtom, signerLatestResponsesMap);
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
