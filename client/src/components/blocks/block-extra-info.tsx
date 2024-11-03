import { consensusBlockAtoms } from '@/store/blocks-store';
import { useAtomValue } from 'jotai';
import React from 'react';
import { getConsensusBlock } from 'slot-watch-common';
import { DataLabel, DataValue } from '../data-group';

export function BlockExtraInfo({ consensusHash }: { consensusHash: string }) {
  const consensusBlockInfo = useAtomValue(consensusBlockAtoms(consensusHash));

  return (
    <>
      <DataLabel>Burn Height</DataLabel>
      <DataValue>{consensusBlockInfo.burn_block_height}</DataValue>

      <DataLabel>Burn Block</DataLabel>
      <DataValue>{consensusBlockInfo.burn_block_hash}</DataValue>

      <DataLabel>Burn Block Time</DataLabel>
      <DataValue>
        {new Date(
          consensusBlockInfo.burn_header_timestamp * 1000,
        ).toLocaleString()}
      </DataValue>
    </>
  );
}
