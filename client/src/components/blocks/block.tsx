import React from 'react';
import { useAtom } from 'jotai';
import { blockPushesAtoms, blockSignersAtoms } from '@/store/blocks-store';
import { BlockSigners } from './block-signers';
import { textStyles } from '@/lib/text-variants';
import { TimeAgo } from '../time-ago';
import {
  getApiUrl,
  getBtcAddress,
  getStacksAddress,
  percentString,
} from 'slot-watch-common';
import { differenceInSeconds } from 'date-fns';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { ChevronsUpDownIcon } from 'lucide-react';
import { Link } from 'react-router-dom';

function DataValue({ children }: { children: React.ReactNode }) {
  return <p className={textStyles('muted')}>{children}</p>;
}

function DataLabel({ children }: { children: React.ReactNode }) {
  return <p className={textStyles('small', 'pr-4 text-nowrap')}>{children}</p>;
}

export function Block({
  signerSignatureHash,
}: {
  signerSignatureHash: string;
}) {
  const [isOpen, setIsOpen] = React.useState(false);
  const [blockPushes] = useAtom(blockPushesAtoms(signerSignatureHash));

  if (blockPushes === null) {
    return null;
  }

  const secondsAgo = React.useMemo(() => {
    if (blockPushes.pushedAt === null) return null;
    return differenceInSeconds(blockPushes.pushedAt, blockPushes.createdAt);
  }, [blockPushes.createdAt, blockPushes.pushedAt]);

  const { btcAddress, stxAddress } = React.useMemo(() => {
    if (blockPushes.minerPublicKey) {
      return {
        btcAddress: getBtcAddress(blockPushes.minerPublicKey),
        stxAddress: getStacksAddress(
          blockPushes.minerPublicKey,
          blockPushes.networkKey,
        ),
      };
    }
    return { btcAddress: '', stxAddress: '' };
  }, [blockPushes.minerPublicKey, blockPushes.networkKey]);

  return (
    <div className="flex flex-col gap-2">
      <div className="flex w-full flex-col md:flex-row md:justify-between">
        <Collapsible open={isOpen} onOpenChange={setIsOpen}>
          <CollapsibleTrigger>
            <div className="flex justify-between items-center space-x-4">
              <p className={textStyles('h3')}>{blockPushes.chainLength}</p>
              <ChevronsUpDownIcon className="w-4 h-4" />
            </div>
          </CollapsibleTrigger>
          {isOpen ? null : (
            <div className="grid gap-0 grid-cols-[min-content_1fr] items-center">
              <DataLabel>Proposed</DataLabel>
              <DataValue>
                <TimeAgo date={blockPushes.createdAt} />
              </DataValue>
            </div>
          )}
          <CollapsibleContent>
            <div className="grid gap-0 grid-cols-[minmax(150px,min-content)_1fr] items-center">
              <DataLabel>Proposed</DataLabel>
              <DataValue>
                <TimeAgo date={blockPushes.createdAt} />
              </DataValue>

              <DataLabel>Pushed</DataLabel>
              <DataValue>
                {blockPushes.pushedAt ? (
                  <>
                    <TimeAgo date={blockPushes.pushedAt} />
                    <span className="ml-1">
                      {secondsAgo ? `(${secondsAgo}s)` : ''}
                    </span>
                  </>
                ) : (
                  'N/A'
                )}
              </DataValue>

              <DataLabel>Miner Address</DataLabel>
              <DataValue>{btcAddress}</DataValue>
              <DataLabel>Miner Address</DataLabel>
              <DataValue>{stxAddress}</DataValue>

              <DataLabel>Consensus Hash</DataLabel>
              <DataValue>
                <Link
                  to={`${getApiUrl(blockPushes.networkKey)}/v3/sortitions/consensus/${blockPushes.consensusHash}`}
                  target="_blank"
                >
                  {blockPushes.consensusHash}
                </Link>
              </DataValue>
            </div>
          </CollapsibleContent>
        </Collapsible>
        <div className="flex items-end">
          <span className={textStyles('large')}>
            {blockPushes.accepted
              ? 'Accepted'
              : blockPushes.accepted === false
                ? 'Rejected'
                : 'Pending'}
          </span>
        </div>
      </div>

      {/* <div className="flex flex-col gap-1"> */}
      <BlockSigners
        signerSignatureHash={signerSignatureHash}
        proposedAt={blockPushes.createdAt}
      />

      <div className="w-full flex flex-col md:flex-row md:justify-between">
        <div className="md:text-center">
          <p className={textStyles('muted')}>
            Accepted: {blockPushes.countAccepted} (
            {percentString(blockPushes.acceptRatio)}%)
          </p>
        </div>
        <div className="md:text-center">
          <p className={textStyles('muted')}>
            Rejected: {blockPushes.countRejected} (
            {percentString(blockPushes.rejectRatio)}%)
          </p>
        </div>
        <div className="md:text-center">
          <p className={textStyles('muted')}>
            Pending: {blockPushes.countPending} (
            {percentString(blockPushes.pendingRatio)}%)
          </p>
        </div>
      </div>
      {/* </div> */}
    </div>
  );
}
