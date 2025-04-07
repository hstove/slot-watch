import React from 'react';
import { useAtomValue } from 'jotai';
import {
  responseOutcomeForBlockAtomFamily,
  responsesForBlockAtomFamily,
} from '@/store/blocks-store';
import { activeBlockAtom } from '@/store/blocks-store';
import { textStyles } from '@/lib/text-variants';
import { DataLabel, DataValue } from '../data-group';
import { Timestamp } from '../timestamp';
import { sha256 } from '@noble/hashes/sha256';
import { ripemd160 } from '@noble/hashes/ripemd160';
import { hex } from '@scure/base';
import { BlockListResponses } from '../blocks-v2/block-list-responses';

export function StacksBlock() {
  const block = useAtomValue(activeBlockAtom);
  useAtomValue(responsesForBlockAtomFamily(block?.blockHash ?? ''));
  const responseOutcome = useAtomValue(
    responseOutcomeForBlockAtomFamily(block?.blockHash ?? ''),
  );

  const minerPkHash = React.useMemo(() => {
    if (!block?.minerPublicKey) return null;
    return hex.encode(ripemd160(sha256(hex.decode(block.minerPublicKey))));
  }, [block?.minerPublicKey]);

  if (!block || !minerPkHash || !responseOutcome) return null;
  return (
    <div className="flex flex-col gap-4">
      <h2 className={textStyles('h2', 'pb-0 mb-0')}>
        Stacks block #{block.blockHeight.toLocaleString()}
      </h2>
      <BlockListResponses blockHash={block.blockHash} />
      {/* <React.Suspense>
        <BlockResponseChart blockHash={block.blockHash} />
      </React.Suspense> */}
      <div className="grid gap-0 grid-cols-[minmax(100px,min-content)_1fr] items-center">
        <DataLabel>Block hash</DataLabel>
        <DataValue>{block.blockHash}</DataValue>
        <DataLabel>Block height</DataLabel>
        <DataValue>{block.blockHeight.toLocaleString()}</DataValue>
        <DataLabel>Percent Accepted</DataLabel>
        <DataValue>
          <span className={'text-green-500'}>
            {responseOutcome.acceptPercentString}%
          </span>
        </DataValue>
        <DataLabel>Percent Rejected</DataLabel>
        <DataValue>
          <span className={'text-red-500'}>
            {responseOutcome.rejectPercentString}%
          </span>
        </DataValue>
        <DataLabel>Block timestamp</DataLabel>
        <DataValue>
          <Timestamp timestamp={block.blockTimestamp} />
        </DataValue>
        {block.proposedAt && (
          <>
            <DataLabel>Proposed at</DataLabel>
            <DataValue>
              <Timestamp timestamp={block.proposedAt} />
            </DataValue>
          </>
        )}
        {block.processedAt && (
          <>
            <DataLabel>Processed at</DataLabel>
            <DataValue>
              <Timestamp timestamp={block.processedAt} />
            </DataValue>
          </>
        )}

        <DataLabel>Miner public key</DataLabel>
        <DataValue>{block.minerPublicKey}</DataValue>
        <DataLabel>Miner public key hash</DataLabel>
        <DataValue>{minerPkHash}</DataValue>

        <DataLabel>Burn block height</DataLabel>
        <DataValue>{block.burnBlockHeight.toLocaleString()}</DataValue>
        {block.burnBlockHash && (
          <>
            <DataLabel>Burn block hash</DataLabel>
            <DataValue>{block.burnBlockHash}</DataValue>
          </>
        )}
        {block.consensusHash && (
          <>
            <DataLabel>Consensus hash</DataLabel>
            <DataValue>{block.consensusHash}</DataValue>
          </>
        )}

        <DataLabel>Transactions</DataLabel>
        <DataValue>{block.txCount.toLocaleString()}</DataValue>

        {block.tenureChangeCause !== null && (
          <>
            <DataLabel>Tenure Change Cause</DataLabel>
            <DataValue>
              {block.tenureChangeCause ? 'Extended' : 'Block found'}
            </DataValue>
          </>
        )}

        <DataLabel>Miner's node version</DataLabel>
        <DataValue>{block.serverVersion || 'Unknown'}</DataValue>
      </div>
      {process.env.NODE_ENV === 'development' && (
        <code>
          <pre>{JSON.stringify(block, null, 2)}</pre>
        </code>
      )}
    </div>
  );
}
