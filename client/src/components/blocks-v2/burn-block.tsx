import React from 'react';
import { useAtomValue, useSetAtom } from 'jotai';
import {
  burnBlocksAtomFamily,
  stacksBlocksForBurnBlockAtom,
} from '@/store/blocks-store';
import { Text } from '../text';
import { atomEffect } from 'jotai-effect';
import {
  Table,
  TableBody,
  TableHead,
  TableHeader,
  TableRow,
  TableCell,
} from '@/components/ui/table';
import { BlockListStacksBlock } from './block-list-stacks-block';
import { BtcIcon } from '../icons/btc-icon';
import { Timestamp } from '../timestamp';

export const BurnBlock = ({
  burnBlockHeight,
  burnBlockHash,
}: { burnBlockHeight: number; burnBlockHash: string }) => {
  const burnBlock = useAtomValue(burnBlocksAtomFamily(burnBlockHash));
  const stacksBlocks = useAtomValue(
    stacksBlocksForBurnBlockAtom(burnBlockHeight),
  );

  if (!burnBlock) return null;

  return (
    <div className="w-full border rounded-lg p-4 flex flex-col gap-2">
      <div className="flex items-center gap-3">
        <BtcIcon />
        <Text variant="small">{burnBlock.burnBlockHeight}</Text>
        <Text variant="small" className="text-muted-foreground font-mono">
          {burnBlock.burnBlockHash.slice(0, 6)}...
          {burnBlock.burnBlockHash.slice(-6)}
        </Text>
        <Text variant="small" className="text-muted-foreground font-mono">
          <Timestamp timestamp={burnBlock.createdAt} />
        </Text>
      </div>

      {stacksBlocks.length > 0 ? (
        <div className="grid grid-cols-[repeat(4,minmax(min-content,1fr))] gap-y-0 gap-x-2 auto-cols-max">
          <div className="block-list-col">
            <Text variant="small">Height</Text>
          </div>
          <div className="block-list-col">
            <Text variant="small">Timestamp</Text>
          </div>
          <div className="block-list-col">
            <Text variant="small">Block Hash</Text>
          </div>
          <div className="block-list-col">
            <Text variant="small">Info</Text>
          </div>
          {/* <div className="bg-red-500 col-span-4">This should be full width</div> */}
          {stacksBlocks.map((block) => (
            <BlockListStacksBlock
              key={block.blockHash}
              blockHash={block.blockHash}
            />
          ))}
        </div>
      ) : (
        <div className="flex items-center mt-4">
          <Text variant="small" className="text-muted-foreground font-normal">
            No Stacks blocks
          </Text>
        </div>
      )}
    </div>
  );
};
