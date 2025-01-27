import React from 'react';
import { useAtomValue, useSetAtom } from 'jotai';
import { Text } from '@/components/text';
import {
  activeBlockHashAtom,
  maxProcessedStacksHeightAtom,
  responseOutcomeForBlockAtomFamily,
  stacksBlocksFamily,
} from '@/store/blocks-store';
import { Timestamp } from '../timestamp';
import { TenureChangeCause } from '@stacks/transactions';
import { Badge } from '../ui/badge';
import {
  ArrowRightFromLine,
  BlocksIcon,
  ExternalLinkIcon,
  SearchIcon,
} from 'lucide-react';
import { statusStyles } from '@/lib/status-variants';
import { SimpleTooltip } from '../simple-tooltip';
import { BlockListResponses } from './block-list-responses';
import { BlockCosts } from './burn-block-costs';
import * as R from 'remeda';
import { textStyles } from '@/lib/text-variants';
import { PublicKey } from '../public-key';
import { Button } from '../ui/button';
import { Link } from '@tanstack/react-router';
import { getStacksExplorerUrl } from 'slot-watch-common';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { DataLabel, DataValue } from '../data-group';

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
  if (status === 'pending') {
    return (
      <>
        <SimpleTooltip
          content={`${responseOutcome.rejectPercentString}% Rejected`}
        >
          <Badge className={statusStyles('warning')} size="icon">
            {responseOutcome.rejectPercentString}%
          </Badge>
        </SimpleTooltip>
        <SimpleTooltip
          content={`${responseOutcome.acceptPercentString}% Accepted`}
        >
          <Badge className={statusStyles('success')} size="icon">
            {responseOutcome.acceptPercentString}%
          </Badge>
        </SimpleTooltip>
      </>
    );
  }
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
  const setActiveBlockHash = useSetAtom(activeBlockHashAtom);
  const maxProcessed = useAtomValue(maxProcessedStacksHeightAtom);

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
          <div className="flex gap-3">
            <button
              type="reset"
              onClick={() => {
                setActiveBlockHash(blockHash);
              }}
              className={textStyles('small')}
            >
              {/* <Text variant="small">{block.blockHeight}</Text> */}
              {block.blockHeight}
            </button>
            <div className="flex gap-1">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setActiveBlockHash(blockHash);
                }}
              >
                <SearchIcon className="w-3 h-3" />
              </Button>
              <Button variant="ghost" size="sm" asChild>
                <Link
                  to={getStacksExplorerUrl(
                    `/block/${blockHash}`,
                    block.networkKey,
                  )}
                  target="_blank"
                >
                  <ExternalLinkIcon className="w-3 h-3" />
                </Link>
              </Button>
            </div>
          </div>
        </div>
        <div className="block-list-col">
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger>
                <Text variant="small">
                  <Timestamp timestamp={block.blockTimestamp} />
                </Text>
              </TooltipTrigger>
              <TooltipContent>
                <div className="grid gap-0 grid-cols-[minmax(100px,min-content)_1fr] items-center">
                  <DataLabel>Block timestamp</DataLabel>
                  <DataValue>
                    <Timestamp timestamp={block.blockTimestamp} />
                  </DataValue>
                  {block.proposedAt ? (
                    <>
                      <DataLabel>Proposed at</DataLabel>
                      <DataValue>
                        <Timestamp timestamp={block.proposedAt} />
                      </DataValue>
                    </>
                  ) : null}
                  {block.processedAt ? (
                    <>
                      <DataLabel>Processed at</DataLabel>
                      <DataValue>
                        <Timestamp timestamp={block.processedAt} />
                      </DataValue>
                    </>
                  ) : null}
                </div>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
        <div className="block-list-col [&]:hidden [&]:md:flex">
          <PublicKey publicKey={block.blockHash} className="max-w-[200px]" />
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
          {!block.processedAt && <ResponseOutcome blockHash={blockHash} />}
          {/* <ResponseOutcome blockHash={blockHash} /> */}
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
      {blockStatus === 'pending' ? (
        <BlockListResponses blockHash={blockHash} />
      ) : null}
    </>
  );
};
