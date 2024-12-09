import React from 'react';
import { useAtomValue } from 'jotai';
import { Text } from '@/components/text';
import {
  maxProcessedStacksHeightAtom,
  stacksBlocksFamily,
} from '@/store/blocks-store';
import { Timestamp } from '../timestamp';
import { TenureChangeCause } from '@stacks/transactions';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import { ArrowRightFromLine, BlocksIcon } from 'lucide-react';
import { statusStyles } from '@/lib/status-variants';
import { SimpleTooltip } from '../simple-tooltip';

function TenureCauseBadge({
  tenureCause,
}: { tenureCause: TenureChangeCause | null }) {
  if (tenureCause === null) return null;
  if (tenureCause === TenureChangeCause.Extended) {
    return (
      <div>
        <SimpleTooltip content="Tenure Extended">
          <Badge theme="cyan" size="icon">
            <ArrowRightFromLine className="w-3 h-3" />
          </Badge>
        </SimpleTooltip>
      </div>
    );
  }
  if (tenureCause === TenureChangeCause.BlockFound) {
    return (
      <div>
        <SimpleTooltip content="Tenure Change">
          <Badge theme="teal" size="icon">
            <BlocksIcon className="w-3 h-3" />
          </Badge>
        </SimpleTooltip>
      </div>
    );
  }
  return null;
}

export const BlockListStacksBlock = ({ blockHash }: { blockHash: string }) => {
  const block = useAtomValue(stacksBlocksFamily(blockHash));
  const maxProcessed = useAtomValue(maxProcessedStacksHeightAtom);
  // return <div>{blocks.map((b) => <div key={b.blockHash}>{b.blockHeight}</div>)}</div>;

  const logBlock = React.useCallback(() => {
    console.log(block);
  }, [block]);

  const blockStatus = React.useMemo(() => {
    if (block.processedAt) {
      return 'success';
    }
    if (block.blockHeight <= maxProcessed) {
      return 'error';
    }
    return 'pending';
  }, [block, maxProcessed]);

  return (
    <>
      <div className="[&]:gap-x-0 block-list-col sticky">
        <div className="relative flex w-0 h-full mr-3 justify-center items-center">
          {/* <div className="absolute h-full w-[1px] bg-stacks block" /> */}
          <div
            className={statusStyles(
              blockStatus,
              'w-2 h-2 absolute rounded-full',
            )}
          />
        </div>
        <Text variant="small">{block.blockHeight}</Text>
      </div>
      <div className="block-list-col">
        <Text variant="small">
          <Timestamp
            timestamp={
              block.proposedAt ?? block.processedAt ?? new Date().toISOString()
            }
          />
        </Text>
      </div>
      <div className="block-list-col">
        <Text variant="small" className="font-mono text-xs">
          {block.blockHash.slice(0, 70)}
        </Text>
      </div>
      <div className="block-list-col">
        <TenureCauseBadge tenureCause={block.tenureChangeCause} />
        {block.txCount && (
          <Badge size="icon" variant="outline">
            {block.txCount} tx{block.txCount > 1 ? 's' : ''}
          </Badge>
        )}
        {/* <Button size="sm" onClick={logBlock}>
          Log
        </Button> */}
      </div>
    </>
  );
};
