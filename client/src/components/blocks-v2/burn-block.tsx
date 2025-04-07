import React from 'react';
import { useAtomValue } from 'jotai';
import {
  burnBlocksAtomFamily,
  maxBurnBlockHeightAtom,
  sortedStacksBlocksForBurnBlockAtom,
} from '@/store/blocks-store';
import { Text } from '../text';
import { BlockListStacksBlock } from './block-list-stacks-block';
import { BtcIcon } from '../icons/btc-icon';
import { Timestamp } from '../timestamp';
import { BurnBlockCosts } from './burn-block-costs';
import { PublicKey } from '../public-key';
import { Link } from '@tanstack/react-router';

export const BurnBlock = ({
  burnBlockHeight,
  burnBlockHash,
}: { burnBlockHeight: number; burnBlockHash: string }) => {
  const burnBlock = useAtomValue(burnBlocksAtomFamily(burnBlockHash));

  if (!burnBlock) return null;

  return (
    <div className="w-full border rounded-lg p-4 flex flex-col gap-2 container">
      <div className="flex justify-between items-center sticky top-[60px] bg-background py-4 z-10 w-full">
        <div className="flex items-center gap-3">
          <BtcIcon />
          <Link
            to={'/btc-blocks/$heightOrHash'}
            params={{ heightOrHash: burnBlock.burnBlockHeight.toString() }}
          >
            <Text variant="small">{burnBlock.burnBlockHeight}</Text>
          </Link>

          <div className="hidden md:block">
            <PublicKey publicKey={burnBlock.burnBlockHash} />
          </div>
          <Text variant="small" className="text-muted-foreground">
            <Timestamp timestamp={burnBlock.createdAt} />
          </Text>
        </div>
        <React.Suspense>
          <BurnBlockCosts burnBlockHeight={burnBlockHeight} />
        </React.Suspense>
      </div>
      <BurnBlockStacksBlocks burnBlockHeight={burnBlockHeight} />
    </div>
  );
};

export const BurnBlockStacksBlocksInner = ({
  burnBlockHeight,
}: { burnBlockHeight: number }) => {
  const stacksBlocks = useAtomValue(
    sortedStacksBlocksForBurnBlockAtom(burnBlockHeight),
  );
  const maxBurnBlockHeight = useAtomValue(maxBurnBlockHeightAtom);
  const [viewBlocks, setViewBlocks] = React.useState(false);

  if (stacksBlocks.length === 0)
    return (
      <div className="flex items-center mt-4">
        <Text variant="small" className="text-muted-foreground font-normal">
          No Stacks blocks
        </Text>
      </div>
    );

  if (burnBlockHeight !== maxBurnBlockHeight && !viewBlocks) {
    return (
      <div className="flex items-center mt-4">
        <Text variant="small" className="text-muted-foreground font-normal">
          Not showing {stacksBlocks.length} Stacks blocks.{' '}
          <button
            type="reset"
            className="text-primary"
            onClick={() => setViewBlocks(true)}
          >
            View
          </button>
        </Text>
      </div>
    );
  }

  return (
    <>
      <div className="grid grid-cols-[1fr_1fr_1.5fr] md:grid-cols-[repeat(4,minmax(min-content,1fr))] gap-y-0 auto-cols-max">
        <div className="block-list-col">
          <Text variant="small">Height</Text>
        </div>
        <div className="block-list-col">
          <Text variant="small" className="">
            Timestamp
          </Text>
        </div>
        <div className="block-list-col [&]:hidden [&]:md:flex">
          <Text variant="small" className="">
            Block Hash
          </Text>
        </div>
        <div className="block-list-col">
          <Text variant="small">Info</Text>
        </div>
        {stacksBlocks.map((block) => (
          <React.Suspense key={block.blockHash}>
            <BlockListStacksBlock blockHash={block.blockHash} />
          </React.Suspense>
        ))}
        {burnBlockHeight !== maxBurnBlockHeight && (
          <div className="flex items-center gap-2 mt-2">
            <Text variant="small" className="text-muted-foreground font-normal">
              <button type="reset" onClick={() => setViewBlocks(false)}>
                Hide {stacksBlocks.length} Stacks blocks
              </button>
            </Text>
          </div>
        )}
      </div>
    </>
  );
};

export const BurnBlockStacksBlocks = ({
  burnBlockHeight,
}: { burnBlockHeight: number }) => {
  return (
    <React.Suspense>
      <BurnBlockStacksBlocksInner burnBlockHeight={burnBlockHeight} />
    </React.Suspense>
  );
};
