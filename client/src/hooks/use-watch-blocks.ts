import { useWebSocket } from './use-websocket';
import {
  BURN_BLOCK_V2_EVENT,
  NEW_BLOCK_V2_EVENT,
  BLOCK_PROPOSAL_EVENT,
  type WSPayload,
  type ApiBlockProposal,
  BLOCK_RESPONSE_EVENT,
  type BlockResponseApi,
  type ApiStateMachineUpdate,
  STATE_MACHINE_UPDATE_EVENT,
} from 'slot-watch-common';
import React from 'react';
import { useAtomCallback } from 'jotai/utils';
import { networkIdAtom } from '@/store/network';
import {
  __stacksBlocksFamilyInner,
  insertBurnBlockAtom,
  removeResponsesForBlock,
  responseOutcomeForBlockAtomFamily,
  setResponseForBlockFamily,
  setStacksBlocksForBurnBlockFamily,
} from '@/store/blocks-store';
import type { ProcessedStacksBlock, ProposalOnlyBlock } from '@/lib/slots-api';
import { setLatestStateMachinesAtom } from '@/store/state-machine-store';

export const useWatchBlocks = () => {
  const { lastMessage, readyState } = useWebSocket();

  const handleBlockResponse = useAtomCallback(
    React.useCallback((get, set, blockResponse: BlockResponseApi) => {
      const networkKey = get(networkIdAtom);
      const signerSignatureHash = blockResponse.signerSignatureHash;
      const ts = blockResponse.tenureExtendTimestamp;
      const tenureExtendTimestamp = ts ? new Date(ts).toISOString() : null;
      const rejectStuff = blockResponse.accepted
        ? {}
        : {
            reason: blockResponse.reason,
            reasonCode: blockResponse.rejectReason,
            validationCode: blockResponse.validationCode,
            version: blockResponse.version,
          };
      set(setResponseForBlockFamily(signerSignatureHash), signerSignatureHash, {
        accepted: blockResponse.accepted,
        signerPublicKey: blockResponse.signerPublicKey,
        signerSignatureHash,
        createdAt: blockResponse.createdAt,
        networkKey,
        tenureExtendTimestamp,
        ...rejectStuff,
      });
    }, []),
  );

  const handleBlockProposal = useAtomCallback(
    React.useCallback((get, set, blockProposal: ApiBlockProposal) => {
      console.log(
        'Received block proposal',
        blockProposal.chainLength,
        blockProposal.signerSignatureHash,
      );
      const networkKey = get(networkIdAtom);
      const base = {
        blockHash: blockProposal.signerSignatureHash,
        burnBlockHeight: blockProposal.burnBlockHeight,
        minerPublicKey: blockProposal.minerPublicKey,
        txCount: blockProposal.txCount,
        tenureChangeCause: blockProposal.tenureChangeCause,
        consensusHash: blockProposal.consensusHash,
        blockHeight: blockProposal.chainLength,
        blockTimestamp: blockProposal.blockTimestamp,
        networkKey,
        proposedAt: blockProposal.createdAt,
        serverVersion: blockProposal.serverVersion,
        serverVersionShort: blockProposal.serverVersionShort,
        txFees: blockProposal.txFees,
      } satisfies ProposalOnlyBlock;
      const existing = get(
        __stacksBlocksFamilyInner(blockProposal.signerSignatureHash),
      );
      set(
        setStacksBlocksForBurnBlockFamily(base.consensusHash),
        base.consensusHash,
        {
          ...existing,
          ...base,
        },
      );
    }, []),
  );

  const handleStateMachineUpdate = useAtomCallback(
    React.useCallback(
      (_get, set, stateMachineUpdate: ApiStateMachineUpdate) => {
        console.log('Received state machine update', stateMachineUpdate);
        set(setLatestStateMachinesAtom, {
          ...stateMachineUpdate,
        });
      },
      [],
    ),
  );

  const handleMessage = useAtomCallback(
    React.useCallback(
      // biome-ignore lint/suspicious/noExplicitAny: This is a websocket message event
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
          if (payload.type === BLOCK_PROPOSAL_EVENT) {
            const blockProposal = payload.payload;
            handleBlockProposal(blockProposal);
          } else if (payload.type === BLOCK_RESPONSE_EVENT) {
            const blockResponse = payload.payload;
            handleBlockResponse(blockResponse);
          } else if (payload.type === NEW_BLOCK_V2_EVENT) {
            const block = payload.payload;
            console.log('Received block', block.blockHeight, block.blockHash);

            const existing = get(__stacksBlocksFamilyInner(block.blockHash));
            const base = {
              ...block,
            } satisfies ProcessedStacksBlock;
            set(
              setStacksBlocksForBurnBlockFamily(base.consensusHash),
              base.consensusHash,
              {
                ...existing,
                ...base,
              },
            );

            // Once a block is "finalized" (arrives in new_block),
            // we no longer need the per-block signer responses in memory.
            // Remove them via the family remove method.
            removeResponsesForBlock(block.blockHash);
            responseOutcomeForBlockAtomFamily.remove(block.blockHash);
          } else if (payload.type === BURN_BLOCK_V2_EVENT) {
            const burnBlock = payload.payload;
            console.log('Received burn block', burnBlock.burnBlockHeight);
            set(insertBurnBlockAtom, {
              ...burnBlock,
            });
          } else if (payload.type === STATE_MACHINE_UPDATE_EVENT) {
            const stateMachineUpdate = payload.payload;
            handleStateMachineUpdate(stateMachineUpdate);
          }
        } catch (error) {
          console.debug('Error parsing message', error);
        }
      },
      [handleBlockProposal, handleBlockResponse, handleStateMachineUpdate],
    ),
  );

  React.useEffect(() => {
    handleMessage(lastMessage);
  }, [lastMessage, handleMessage]);

  return {
    readyState,
  };
};
