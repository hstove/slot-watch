import React from 'react';
import { useAtom } from 'jotai';
import { blockPushesAtoms, } from '@/store/blocks-store';
import { BlockSigners } from './block-signers';
import { textStyles } from '@/lib/text-variants';
import {
  getApiUrl,
  getBtcAddress,
  getStacksAddress,
  getStacksExplorerUrl,
  makeStacksBlockId,
  percentString,
} from 'slot-watch-common';
import { differenceInSeconds } from 'date-fns';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { ChevronsUpDownIcon } from 'lucide-react';
import { Link } from '@tanstack/react-router';
import { BlockExtraInfo } from './block-extra-info';
import { ripemd160 } from '@noble/hashes/ripemd160';
import { sha256 } from '@noble/hashes/sha256';
import { hex } from '@scure/base';

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

  const { btcAddress, stxAddress, minerHash } = React.useMemo(() => {
    if (blockPushes.minerPublicKey) {
      return {
        btcAddress: getBtcAddress(blockPushes.minerPublicKey),
        stxAddress: getStacksAddress(
          blockPushes.minerPublicKey,
          blockPushes.networkKey,
        ),
        minerHash: hex.encode(ripemd160(sha256(blockPushes.minerPublicKey))),
      };
    }
    return { btcAddress: '', stxAddress: '', minerHash: '' };
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
                {new Date(blockPushes.createdAt).toLocaleString()}
              </DataValue>
            </div>
          )}
          <CollapsibleContent>
            <div className="grid gap-0 grid-cols-[minmax(150px,min-content)_1fr] items-center">
              <DataLabel>Proposed</DataLabel>
              <DataValue>
                {new Date(blockPushes.createdAt).toLocaleString()}
              </DataValue>

              <DataLabel>Pushed</DataLabel>
              <DataValue>
                {blockPushes.pushedAt ? (
                  <>
                    {new Date(blockPushes.pushedAt).toLocaleString()}
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
              <DataLabel>Miner Public Key</DataLabel>
              <DataValue>{blockPushes.minerPublicKey}</DataValue>
              <DataLabel>Miner Hash</DataLabel>
              <DataValue>{minerHash}</DataValue>
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

              <DataLabel>Block Hash</DataLabel>
              <DataValue>
                <Link
                  to={getStacksExplorerUrl(
                    `/block/0x${blockPushes.signerSignatureHash}`,
                    blockPushes.networkKey,
                  )}
                  target="_blank"
                >
                  {blockPushes.signerSignatureHash}
                </Link>
              </DataValue>

              <DataLabel>Transactions</DataLabel>
              <DataValue>{blockPushes.txCount}</DataValue>

              <DataLabel>Block ID</DataLabel>
              <DataValue>
                {makeStacksBlockId(
                  blockPushes.signerSignatureHash,
                  blockPushes.consensusHash ?? '',
                )}
              </DataValue>

              <React.Suspense fallback={null}>
                <BlockExtraInfo
                  consensusHash={blockPushes.consensusHash ?? ''}
                />
              </React.Suspense>
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
