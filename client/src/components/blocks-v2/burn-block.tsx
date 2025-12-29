import React, { useMemo } from 'react';
import { useAtomValue } from 'jotai';
import {
  burnBlocksAtomFamily,
  maxBurnBlockConsensusHashAtom,
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
import { microStxToStx } from 'slot-watch-common';
import { SimpleTooltip } from '../simple-tooltip';
import { Badge } from '../ui/badge';

export const BurnBlock = ({
  consensusHash,
  burnBlockHash,
}: {
  consensusHash: string;
  burnBlockHash: string;
}) => {
  const burnBlock = useAtomValue(burnBlocksAtomFamily(burnBlockHash));

  if (!burnBlock) return null;

  return (
    <div className="w-full border border-border bg-card container">
      {/* Header */}
      <div className="flex justify-between items-center sticky top-[60px] z-10 w-full border-b border-border px-4 py-3 bg-muted/30">
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
        <div className="flex gap-2">
          <BurnBlockTxFees consensusHash={consensusHash} />
          <BurnBlockCosts consensusHash={consensusHash} />
        </div>
      </div>
      {/* Content */}
      <div className="p-4">
        <BurnBlockStacksBlocks consensusHash={consensusHash} />
      </div>
    </div>
  );
};

export const BurnBlockStacksBlocksInner = ({
  consensusHash,
}: {
  consensusHash: string;
}) => {
  const stacksBlocks = useAtomValue(
    sortedStacksBlocksForBurnBlockAtom(consensusHash)
  );
  const maxBurnBlockConsensusHash = useAtomValue(maxBurnBlockConsensusHashAtom);
  const [viewBlocks, setViewBlocks] = React.useState(false);

  if (stacksBlocks.length === 0)
    return (
      <div className="flex items-center mt-4">
        <Text variant="small" className="text-muted-foreground font-normal">
          No Stacks blocks
        </Text>
      </div>
    );

  if (consensusHash !== maxBurnBlockConsensusHash && !viewBlocks) {
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
    // biome-ignore lint/complexity/noUselessFragments: ignored using `--suppress`
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
        {consensusHash !== maxBurnBlockConsensusHash && (
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
  consensusHash,
}: {
  consensusHash: string;
}) => {
  return (
    <React.Suspense>
      <BurnBlockStacksBlocksInner consensusHash={consensusHash} />
    </React.Suspense>
  );
};

export const BurnBlockTxFees = ({
  consensusHash,
}: {
  consensusHash: string;
}) => {
  const stacksBlocks = useAtomValue(
    sortedStacksBlocksForBurnBlockAtom(consensusHash)
  );

  const totalFees = useMemo(() => {
    const feesUstx = stacksBlocks.reduce((acc, block) => acc + block.txFees, 0);
    return microStxToStx(feesUstx).toFormat();
  }, [stacksBlocks]);

  return (
    <SimpleTooltip content={'Transaction fees'}>
      <Badge size="icon" variant="outline" className="">
        <span>{totalFees}</span>
      </Badge>
    </SimpleTooltip>
  );
};
