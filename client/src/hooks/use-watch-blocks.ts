import { useWebSocket } from './use-websocket';
import {
  type BlockProposal,
  type BlockResponseAccepted,
  type BlockResponseRejected,
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
  insertBurnBlockAtom,
  setResponseForBlockFamily,
  setStacksBlocksForBurnBlockFamily,
} from '@/store/blocks-store';
import { hex } from '@scure/base';
import type {
  ProcessedStacksBlock,
  ProposalOnlyBlock,
} from '@/lib/slots-api';
import {
  deserializeTransaction,
  PayloadType,
  type TenureChangeCause,
} from '@stacks/transactions';

export const useWatchBlocks = () => {
  const { lastMessage, readyState, sendMessage } = useWebSocket();

  const handleBlockResponse = useAtomCallback(
    React.useCallback(
      (
        get,
        set,
        blockResponse: BlockResponseAccepted | BlockResponseRejected,
        publicKey: string,
        receivedAt: string,
      ) => {
        const networkKey = get(networkIdAtom);
        const signerSignatureHash = hex.encode(
          blockResponse.signerSignatureHash,
        );
        const ts = blockResponse.data.tenureExtendTimestamp;
        const tenureExtendTimestamp = ts
          ? new Date(Number(ts * 1000n)).toISOString()
          : null;
        const rejectStuff = blockResponse.accepted
          ? {}
          : {
              reason: blockResponse.reason,
              reasonCode: blockResponse.reasonCode,
              validationCode: blockResponse.validationCode,
              version: blockResponse.metadata,
            };
        set(
          setResponseForBlockFamily(signerSignatureHash),
          signerSignatureHash,
          {
            accepted: blockResponse.accepted,
            signerPublicKey: publicKey,
            signerSignatureHash,
            createdAt: receivedAt,
            networkKey,
            tenureExtendTimestamp,
            ...rejectStuff,
          },
        );
      },
      [],
    ),
  );

  const handleBlockProposal = useAtomCallback(
    React.useCallback(
      (
        get,
        set,
        blockProposal: BlockProposal,
        publicKey: string,
        receivedAt: string,
      ) => {
        const networkKey = get(networkIdAtom);
        const signerSignatureHash = hex.encode(
          makeSignerSignatureHash(blockProposal),
        );
        const blockTimestamp = new Date(
          Number(blockProposal.timestamp * 1000n),
        ).toISOString();
        const base = {
          blockHash: signerSignatureHash,
          burnBlockHeight: Number(blockProposal.blockHeight),
          minerPublicKey: publicKey,
          txCount: blockProposal.txCount,
          tenureChangeCause: blockProposal.tenureChangeCause,
          consensusHash: hex.encode(blockProposal.consensusHash),
          blockHeight: Number(blockProposal.chainLength),
          blockTimestamp,
          networkKey,
          proposedAt: receivedAt,
        } satisfies ProposalOnlyBlock;
        const existing = get(__stacksBlocksFamilyInner(signerSignatureHash));
        set(
          setStacksBlocksForBurnBlockFamily(base.burnBlockHeight),
          base.burnBlockHeight,
          {
            ...existing,
            ...base,
          },
        );
      },
      [],
    ),
  );

  const handleMessage = useAtomCallback(
    React.useCallback(
      // biome-ignore lint/suspicious/noExplicitAny: <explanation>
      (get, set, message: MessageEvent<any> | null) => {
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
              if (decoded?.typeId === SignerMessageTypePrefix.BlockProposal) {
                handleBlockProposal(decoded, publicKey, payload.receivedAt);
              } else if (
                decoded?.typeId === SignerMessageTypePrefix.BlockResponse
              ) {
                handleBlockResponse(decoded, publicKey, payload.receivedAt);
              }
            }
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
            const blockTimestamp = block.block_time
              ? new Date(block.block_time * 1000).toISOString()
              : new Date().toISOString();
            const timestamp = blockTimestamp ?? payload.receivedAt;
            const base = {
              blockHash: block.block_hash,
              burnBlockHeight: block.burn_block_height,
              // minerPublicKey: existing?.minerPublicKey ?? null,
              txCount: block.transactions.length,
              tenureChangeCause,
              blockHeight: block.block_height,
              networkKey: payload.networkKey,
              processedAt: payload.receivedAt,
              burnBlockHash: block.burn_block_hash,
              blockTimestamp,
              ...cost,
            } satisfies ProcessedStacksBlock;
            set(
              setStacksBlocksForBurnBlockFamily(base.burnBlockHeight),
              base.burnBlockHeight,
              {
                ...existing,
                ...base,
              },
            );
          } else if (payload.type === 'burn_blocks') {
            console.log(
              'Received burn block',
              payload.payload.burn_block_height,
            );
            const burnBlock = coreNodeBurnBlockMessageSchema.parse(
              payload.payload,
            );
            set(insertBurnBlockAtom, {
              createdAt: payload.receivedAt,
              burnBlockHash: burnBlock.burn_block_hash,
              burnBlockHeight: burnBlock.burn_block_height,
              networkKey: payload.networkKey,
            });
          }
        } catch (error) {
          console.debug('Error parsing message', error);
        }
      },
      [handleBlockProposal, handleBlockResponse],
    ),
  );

  React.useEffect(() => {
    handleMessage(lastMessage);
  }, [lastMessage, handleMessage]);

  return {
    readyState,
  };
};
