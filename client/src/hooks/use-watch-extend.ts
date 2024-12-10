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
// import { signerLatestResponsesMapAtom } from '@/store/blocks-store';
import {
  signerLatestResponseFamilyInner,
  setSignerLatestResponsesAtom,
} from '@/store/responses-store';
import { hex } from '@scure/base';
import type { ApiBlockResponseForBlock } from '@/lib/slots-api';

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
          // const signerLatestResponsesMap = get(signerLatestResponsesMapAtom);
          for (const chunk of payload.payload) {
            const publicKey = recoverChunkPublicKey({
              signature: hex.decode(chunk.signature),
              data: hex.decode(chunk.data),
              slotId: chunk.slotId,
              version: chunk.version,
            }).toHex();
            // const response = get(signerLatestResponseFamilyInner(publicKey));

            // if (!response) continue;
            const decoded = decodeChunkMaybe(hex.decode(chunk.data));
            if (decoded?.typeId !== SignerMessageTypePrefix.BlockResponse)
              continue;
            const ts = decoded.data.tenureExtendTimestamp;
            const rejectStuff = decoded.accepted
              ? {}
              : {
                  reason: decoded.reason,
                  reasonCode: decoded.reasonCode,
                  validationCode: decoded.validationCode,
                  version: decoded.metadata,
                };
            const base = {
              networkKey: networkId,
              signerSignatureHash: hex.encode(decoded.signerSignatureHash),
              signerPublicKey: publicKey,
              accepted: decoded.accepted,
              createdAt: chunk.createdAt,
              tenureExtendTimestamp: ts
                ? new Date(Number(ts * 1000n)).toISOString()
                : null,
              ...rejectStuff,
            } satisfies ApiBlockResponseForBlock;

            // response.tenureExtendTimestamp = ts
            //   ? new Date(Number(ts * 1000n)).toISOString()
            //   : null;
            // response.createdAt = chunk.createdAt;
            console.log('Updated signer', base);
            set(setSignerLatestResponsesAtom, base);
            // signerLatestResponsesMap.set(publicKey, response);
          }
          // set(signerLatestResponsesMapAtom, signerLatestResponsesMap);
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
