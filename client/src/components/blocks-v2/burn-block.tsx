import React from 'react';
import { useAtomValue, useSetAtom } from 'jotai';
import {
  burnBlocksAtomFamily,
  stacksBlocksForBurnBlockAtom,
} from '@/store/blocks-store';
import { Text } from '../text';
import { atomEffect } from 'jotai-effect';

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
      <Text variant="medium">{burnBlock.burnBlockHeight}</Text>
      <Text variant="small">{burnBlock.burnBlockHash}</Text>

      {stacksBlocks.map((block) => (
        <div key={block.blockHash}>
          <Text variant="small">{block.blockHeight}</Text>
        </div>
      ))}
    </div>
  );
};
