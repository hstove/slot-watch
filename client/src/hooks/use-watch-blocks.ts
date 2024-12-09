import { useWebSocket } from './use-websocket';
import {
  chunkTypeName,
  decodeChunkMaybe,
  makeSignerSignatureHash,
  recoverChunkPublicKey,
  SignerMessageTypePrefix,
  type WSPayload,
} from 'slot-watch-common';
import React from 'react';
import { useAtomCallback } from 'jotai/utils';
import { networkIdAtom } from '@/store/network';
import {
  __stacksBlocksFamilyInner,
  signerLatestResponsesMapAtom,
  stacksBlocksForBurnBlockAtom,
} from '@/store/blocks-store';
import { hex } from '@scure/base';
import type { ApiBlockForBurnBlock } from '@/lib/slots-api';

export const useWatchBlocks = () => {
  const { lastMessage, readyState, sendMessage } = useWebSocket();

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
            const decoded = decodeChunkMaybe(hex.decode(chunk.data));
            console.log(
              'New websocket message: ',
              chunkTypeName(hex.decode(chunk.data)),
            );
            if (decoded?.typeId !== SignerMessageTypePrefix.BlockProposal)
              continue;
            const signerSignatureHash = hex.encode(
              makeSignerSignatureHash(decoded),
            );
            const base = {
              blockHash: signerSignatureHash,
              burnBlockHeight: Number(decoded.blockHeight),
              minerPublicKey: publicKey,
              txCount: decoded.txCount,
              tenureChangeCause: decoded.tenureChangeCause,
              consensusHash: hex.encode(decoded.consensusHash),
              blockHeight: Number(decoded.chainLength),
              networkKey: networkId,
              proposedAt: payload.receivedAt,
            } satisfies ApiBlockForBurnBlock;
            const existing = get(
              __stacksBlocksFamilyInner(signerSignatureHash),
            );
            set(
              stacksBlocksForBurnBlockAtom(base.burnBlockHeight),
              base.burnBlockHeight,
              {
                ...existing,
                ...base,
              },
            );
            // }
            // set(stacksBlocksForBurnBlockAtom(decoded.blockHeight), )
            // const signer = signerLatestResponsesMap.get(publicKey);
            // if (!signer) continue;
            // const decoded = decodeChunkMaybe(hex.decode(chunk.data));
            // if (decoded?.typeId !== SignerMessageTypePrefix.BlockResponse)
            //   continue;
            // const ts = decoded.data.tenureExtendTimestamp;
            // signer.tenureExtendTimestamp = ts
            //   ? new Date(Number(ts * 1000n)).toISOString()
            //   : null;
            // signer.createdAt = chunk.createdAt;
            // console.log('Updated signer', signer);
            // signerLatestResponsesMap.set(publicKey, signer);
          }
          set(signerLatestResponsesMapAtom, signerLatestResponsesMap);
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
