import React from 'react';
import { useAtom } from 'jotai';
import { blockPushesAtoms, blockSignersAtoms } from '@/store/blocks-store';
import { BlockSigners } from './block-signers';
import { textStyles } from '@/lib/text-variants';
import { TimeAgo } from '../time-ago';
import { percentString } from 'slot-watch-common';
import { differenceInSeconds } from 'date-fns';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { ChevronsUpDownIcon } from 'lucide-react';

function DataValue({ children }: { children: React.ReactNode }) {
  return <p className={textStyles('muted')}>{children}</p>;
}

function DataLabel({ children }: { children: React.ReactNode }) {
  return <p className={textStyles('small', 'pr-4')}>{children}</p>;
}

function DataGroup({ children }: { children: React.ReactNode }) {
  return <div className="flex gap-1 items-center">{children}</div>;
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

  return (
    <div className="flex flex-col gap-2">
      <Collapsible open={isOpen} onOpenChange={setIsOpen}>
        <CollapsibleTrigger>
          <div className="flex justify-between items-center space-x-4">
            <p className={textStyles('h3')}>{blockPushes.chainLength}</p>
            <ChevronsUpDownIcon className="w-4 h-4" />
          </div>
        </CollapsibleTrigger>
        {isOpen ? null : (
          <div className="grid gap-0 grid-cols-[minmax(150px,min-content)_1fr] items-center">
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

            <DataLabel>Accepted</DataLabel>
            <DataValue>{percentString(blockPushes.acceptRatio)}%</DataValue>

            <DataLabel>Rejected</DataLabel>
            <DataValue>{percentString(blockPushes.rejectRatio)}%</DataValue>

            <DataLabel>Consensus Hash</DataLabel>
            <DataValue>{blockPushes.consensusHash}</DataValue>
          </div>
        </CollapsibleContent>
      </Collapsible>

      <BlockSigners
        signerSignatureHash={signerSignatureHash}
        proposedAt={blockPushes.createdAt}
      />
    </div>
  );
}
