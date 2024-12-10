import React from 'react';
import { useAtomValue } from 'jotai';
import { Text } from '@/components/text';
import {
  maxProcessedStacksHeightAtom,
  responseOutcomeForBlockAtomFamily,
  stacksBlocksFamily,
} from '@/store/blocks-store';
import { Timestamp } from '../timestamp';
import { TenureChangeCause } from '@stacks/transactions';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import { ArrowRightFromLine, BlocksIcon } from 'lucide-react';
import { statusStyles, statusVariants } from '@/lib/status-variants';
import { SimpleTooltip } from '../simple-tooltip';
import { BlockListResponses } from './block-list-responses';
import { BlockCosts } from './burn-block-costs';
import * as R from 'remeda';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { textStyles } from '@/lib/text-variants';

function TenureCauseBadge({
  tenureCause,
}: { tenureCause: TenureChangeCause | null }) {
  if (tenureCause === null) return null;
  if (tenureCause === TenureChangeCause.Extended) {
    return (
      <SimpleTooltip content="Tenure Extended">
        <Badge theme="cyan" size="icon">
          <ArrowRightFromLine className="w-3 h-3" />
        </Badge>
      </SimpleTooltip>
    );
  }
  if (tenureCause === TenureChangeCause.BlockFound) {
    return (
      <SimpleTooltip content="Tenure Change">
        <Badge theme="teal" size="icon">
          <BlocksIcon className="w-3 h-3" />
        </Badge>
      </SimpleTooltip>
    );
  }
  return null;
}

function ResponseOutcome({ blockHash }: { blockHash: string }) {
  const responseOutcome = useAtomValue(
    responseOutcomeForBlockAtomFamily(blockHash),
  );
  if (!responseOutcome) return null;
  const status =
    responseOutcome.accepted === false
      ? 'error'
      : responseOutcome.accepted
        ? 'success'
        : 'pending';
  return (
    <SimpleTooltip
      content={
        responseOutcome.accepted === false
          ? `${responseOutcome.displayPercent}% Rejected`
          : `${responseOutcome.displayPercent}% Accepted`
      }
    >
      <Badge className={statusStyles(status)} size="icon">
        {responseOutcome.displayPercent}%
      </Badge>
    </SimpleTooltip>
  );
}

export const BlockListStacksBlock = ({ blockHash }: { blockHash: string }) => {
  const block = useAtomValue(stacksBlocksFamily(blockHash));
  const maxProcessed = useAtomValue(maxProcessedStacksHeightAtom);
  const [showResponses, setShowResponses] = React.useState(false);
  const responseOutcome = useAtomValue(
    responseOutcomeForBlockAtomFamily(blockHash),
  );
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
      <div className="contents [&>div]:hover:bg-muted/50">
        <div className="[&]:gap-x-0 block-list-col sticky pl-1">
          <div className="relative flex w-0 h-full mr-3 justify-center items-center">
            {/* <div className="absolute h-full w-[1px] bg-stacks block" /> */}
            <div
              className={statusStyles(
                blockStatus,
                'w-2 h-2 absolute rounded-full',
              )}
            />
          </div>
          <button
            type="reset"
            onClick={() => setShowResponses((show) => !show)}
            className={textStyles('small')}
          >
            {/* <Text variant="small">{block.blockHeight}</Text> */}
            {block.blockHeight}
          </button>
        </div>
        <div className="block-list-col [&]:hidden [&]:md:flex">
          <Text variant="small">
            <Timestamp
              timestamp={
                block.proposedAt ??
                block.processedAt ??
                new Date().toISOString()
              }
            />
          </Text>
        </div>
        <div className="block-list-col [&]:hidden [&]:md:flex">
          {/* <div className="[&]:hidden [&]:md:flex"> */}
          <Text variant="small" className="font-mono text-xs">
            {block.blockHash}
          </Text>
        </div>
        <div className="block-list-col">
          <TenureCauseBadge tenureCause={block.tenureChangeCause} />
          {block.txCount && (
            <SimpleTooltip
              content={`${block.txCount} transaction${block.txCount > 1 ? 's' : ''}`}
            >
              <Badge size="icon" variant="outline" className="">
                <span>{block.txCount}</span>
              </Badge>
            </SimpleTooltip>
          )}
          <ResponseOutcome blockHash={blockHash} />
          {typeof block.readCount === 'number' ? (
            <BlockCosts
              costs={R.pick(block, [
                'readCount',
                'readLength',
                'writeCount',
                'writeLength',
                'runtime',
              ])}
            />
          ) : null}
        </div>
      </div>
      {blockStatus === 'pending' || showResponses ? (
        <BlockListResponses blockHash={blockHash} />
      ) : null}
    </>
  );
};
