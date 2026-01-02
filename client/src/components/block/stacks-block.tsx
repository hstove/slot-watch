import React from 'react';
import { useAtomValue } from 'jotai';
import {
  responseOutcomeForBlockAtomFamily,
  responsesForBlockAtomFamily,
} from '@/store/blocks-store';
import { activeBlockAtom } from '@/store/blocks-store';
import { Timestamp } from '../timestamp';
import { sha256 } from '@noble/hashes/sha256';
import { ripemd160 } from '@noble/hashes/ripemd160';
import { hex } from '@scure/base';
import { BlockListResponses } from '../blocks-v2/block-list-responses';
import { miniResponsesAtomFamilyWithLoader } from '@/store/responses-store';
import { Hex } from '../hex';
import { ExternalLinkIcon } from '@radix-ui/react-icons';
import { Button } from '../ui/button';
import { getStacksExplorerUrl, prefix0x } from 'slot-watch-common';
import { Link } from '@tanstack/react-router';

function DataRow({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex justify-between gap-4 text-xs py-1.5 border-b border-border/50">
      <span className="text-muted-foreground font-mono">{label}</span>
      <span className="font-mono text-right break-all">{children}</span>
    </div>
  );
}

export function StacksBlock() {
  const block = useAtomValue(activeBlockAtom);
  useAtomValue(miniResponsesAtomFamilyWithLoader(block?.blockHash ?? ''));
  useAtomValue(responsesForBlockAtomFamily(block?.blockHash ?? ''));
  const responseOutcome = useAtomValue(
    responseOutcomeForBlockAtomFamily(block?.blockHash ?? '')
  );

  const minerPkHash = React.useMemo(() => {
    if (!block?.minerPublicKey) return null;
    return hex.encode(ripemd160(sha256(hex.decode(block.minerPublicKey))));
  }, [block?.minerPublicKey]);

  if (!(block && minerPkHash && responseOutcome)) return null;
  return (
    <div className="flex flex-col gap-4">
      <h2 className="font-mono text-sm font-medium">
        stacks block #{block.blockHeight.toLocaleString()}
      </h2>
      <BlockListResponses blockHash={block.blockHash} />

      <div className="flex flex-col">
        <DataRow label="block hash">
          <Hex>{block.blockHash}</Hex>
        </DataRow>
        <DataRow label="block height">
          {block.blockHeight.toLocaleString()}
        </DataRow>
        <DataRow label="accepted">
          <span className="text-green-600 dark:text-green-500">
            {responseOutcome.acceptPercentString}%
          </span>
        </DataRow>
        <DataRow label="rejected">
          <span className="text-destructive">
            {responseOutcome.rejectPercentString}%
          </span>
        </DataRow>
        <DataRow label="block timestamp">
          <Timestamp timestamp={block.blockTimestamp} />
        </DataRow>
        {block.proposedAt && (
          <DataRow label="proposed at">
            <Timestamp timestamp={block.proposedAt} />
          </DataRow>
        )}
        {block.processedAt && (
          <DataRow label="processed at">
            <Timestamp timestamp={block.processedAt} />
          </DataRow>
        )}
        <DataRow label="miner public key">
          <Hex>{block.minerPublicKey}</Hex>
        </DataRow>
        <DataRow label="miner public key hash">
          <Hex>{minerPkHash}</Hex>
        </DataRow>
        <DataRow label="burn block height">
          {block.burnBlockHeight.toLocaleString()}
        </DataRow>
        {block.burnBlockHash && (
          <DataRow label="burn block hash">
            <Hex>{block.burnBlockHash}</Hex>
          </DataRow>
        )}
        {block.consensusHash && (
          <DataRow label="consensus hash">
            <Hex>{block.consensusHash}</Hex>
          </DataRow>
        )}
        <DataRow label="transactions">{block.txCount.toLocaleString()}</DataRow>
        {block.tenureChangeCause !== null && (
          <DataRow label="tenure change cause">
            {block.tenureChangeCause ? 'extended' : 'block found'}
          </DataRow>
        )}
        <DataRow label="miner node version">
          {block.serverVersion || 'unknown'}
        </DataRow>
      </div>
      <div className="flex w-full justify-end gap-3">
        <Button variant="ghost" size="sm" asChild>
          <Link
            to="/stx-blocks/$blockHash"
            params={{ blockHash: block.blockHash }}
          >
            <ExternalLinkIcon className="w-3 h-3" />
          </Link>
        </Button>
        <Button variant="ghost" size="sm" className="font-mono" asChild>
          <Link
            to={getStacksExplorerUrl(
              `/block/${prefix0x(block.blockHash)}`,
              block.networkKey
            )}
            target="_blank"
          >
            explorer
          </Link>
        </Button>
      </div>
    </div>
  );
}
