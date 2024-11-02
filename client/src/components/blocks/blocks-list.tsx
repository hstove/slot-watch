import React from 'react';
import { useAtom } from 'jotai';
import { blockHashesAtom, fetchBlocksAtom } from '@/store/blocks-store';
import { useHydrateAtoms } from 'jotai/utils';
import { Block } from './block';

export function BlocksList() {
  const [blockHashes] = useAtom(blockHashesAtom);

  useHydrateAtoms([[fetchBlocksAtom, undefined]]);

  return (
    <div className="w-full flex flex-col gap-8">
      {blockHashes.map((hash) => (
        <Block key={hash} signerSignatureHash={hash} />
      ))}
    </div>
  );
}
