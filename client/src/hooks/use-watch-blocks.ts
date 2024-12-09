import { useWebSocket } from './use-websocket';
import {
  chunkTypeName,
  coreNodeBlockMessageSchema,
  coreNodeBurnBlockMessageSchema,
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
  allBurnBlocksAtom,
  signerLatestResponsesMapAtom,
  stacksBlocksForBurnBlockAtom,
} from '@/store/blocks-store';
import { hex } from '@scure/base';
import type { ApiBlockForBurnBlock } from '@/lib/slots-api';
import {
  deserializeTransaction,
  PayloadType,
  type TenureChangeCause,
} from '@stacks/transactions';

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
          // const signerLatestResponsesMap = get(signerLatestResponsesMapAtom);
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
          // set(signerLatestResponsesMapAtom, signerLatestResponsesMap);
        } else if (payload.type === 'new_block') {
          const block = coreNodeBlockMessageSchema.parse(payload.payload);
          console.log('Received block', block.block_height, block.block_hash);
          const cost = {
            readCount: 0,
            readLength: 0,
            runtime: 0,
            writeCount: 0,
            writeLength: 0,
          };
          let tenureChangeCause: TenureChangeCause | null = null;
          for (const tx of block.transactions) {
            cost.readCount += tx.execution_cost.read_count;
            cost.readLength += tx.execution_cost.read_length;
            cost.runtime += tx.execution_cost.runtime;
            cost.writeCount += tx.execution_cost.write_count;
            cost.writeLength += tx.execution_cost.write_length;
            if (tenureChangeCause === null) {
              const txFull = deserializeTransaction(tx.raw_tx);
              if (txFull.payload.payloadType === PayloadType.TenureChange) {
                tenureChangeCause = txFull.payload.cause;
              }
            }
          }
          const existing = get(__stacksBlocksFamilyInner(block.block_hash));
          const base = {
            blockHash: block.block_hash,
            burnBlockHeight: block.burn_block_height,
            minerPublicKey: existing?.minerPublicKey ?? null,
            txCount: block.transactions.length,
            tenureChangeCause,
            consensusHash: existing?.consensusHash ?? null,
            blockHeight: block.block_height,
            networkKey: payload.networkKey,
            processedAt: payload.receivedAt,
            burnBlockHash: block.burn_block_hash,
            timestamp: block.block_time
              ? new Date(block.block_time * 1000).toISOString()
              : undefined,
            ...cost,
          } satisfies ApiBlockForBurnBlock;
          set(
            stacksBlocksForBurnBlockAtom(base.burnBlockHeight),
            base.burnBlockHeight,
            {
              ...existing,
              ...base,
            },
          );
        } else if (payload.type === 'burn_blocks') {
          console.log('Received burn block', payload.payload.burn_block_height);
          const burnBlock = coreNodeBurnBlockMessageSchema.parse(
            payload.payload,
          );
          set(allBurnBlocksAtom, (blocks) => {
            return [
              {
                createdAt: payload.receivedAt,
                burnBlockHash: burnBlock.burn_block_hash,
                burnBlockHeight: burnBlock.burn_block_height,
                networkKey: payload.networkKey,
              },
              ...blocks,
            ];
          });
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
