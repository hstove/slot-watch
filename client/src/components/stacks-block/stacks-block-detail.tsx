import React from 'react';
import { useAtomValue } from 'jotai';
import {
  responseOutcomeForBlockAtomFamily,
  responsesForBlockAtomFamily,
  cumulativeBlockCostsAtom,
} from '@/store/blocks-store';
import { textStyles } from '@/lib/text-variants';
import { DataLabel, DataValue } from '@/components/data-group';
import { Timestamp } from '@/components/timestamp';
import { sha256 } from '@noble/hashes/sha256';
import { ripemd160 } from '@noble/hashes/ripemd160';
import { hex } from '@scure/base';
import { BlockListResponses } from '@/components/blocks-v2/block-list-responses';
import { miniResponsesAtomFamilyWithLoader } from '@/store/responses-store';
import type { ApiBlockForBurnBlock } from '@/lib/slots-api';
import { PublicKey } from '@/components/public-key';
import { Badge } from '@/components/ui/badge';
import { TenureChangeCause } from '@stacks/transactions';
import {
  getStacksExplorerUrl,
  microStxToStx,
  prefix0x,
} from 'slot-watch-common';
import { Button } from '@/components/ui/button';
import { ExternalLinkIcon, ArrowRightFromLine, BlocksIcon } from 'lucide-react';
import { Link } from '@tanstack/react-router';
import { SimpleTooltip } from '@/components/simple-tooltip';
import { BlockCosts } from '@/components/blocks-v2/burn-block-costs';
import { MAINNET_COST_LIMITS } from '@/lib/costs';
import { percentString } from 'slot-watch-common';
import { ResponseTimelineChart } from '@/components/stacks-block/response-timeline-chart';

interface StacksBlockDetailProps {
  block: ApiBlockForBurnBlock;
}

function TenureCauseBadge({
  tenureCause,
}: {
  tenureCause: TenureChangeCause | null;
}) {
  if (tenureCause === null) return null;
  if (tenureCause === TenureChangeCause.Extended) {
    return (
      <SimpleTooltip content="Tenure Extended">
        <Badge variant="outline" className="text-cyan-600">
          <ArrowRightFromLine className="w-3 h-3 mr-1" />
          Extended
        </Badge>
      </SimpleTooltip>
    );
  }
  if (tenureCause === TenureChangeCause.BlockFound) {
    return (
      <SimpleTooltip content="Tenure Change">
        <Badge variant="outline" className="text-teal-600">
          <BlocksIcon className="w-3 h-3 mr-1" />
          Block Found
        </Badge>
      </SimpleTooltip>
    );
  }
  return null;
}

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: ignored using `--suppress`
export function StacksBlockDetail({ block }: StacksBlockDetailProps) {
  useAtomValue(miniResponsesAtomFamilyWithLoader(block.blockHash));
  useAtomValue(responsesForBlockAtomFamily(block.blockHash));
  const responseOutcome = useAtomValue(
    responseOutcomeForBlockAtomFamily(block.blockHash)
  );
  const cumulativeCosts = useAtomValue(
    cumulativeBlockCostsAtom(block.consensusHash)
  );
  const blockCosts = cumulativeCosts.get(block.blockHash);

  const minerPkHash = React.useMemo(() => {
    if (!block?.minerPublicKey) return null;
    return hex.encode(ripemd160(sha256(hex.decode(block.minerPublicKey))));
  }, [block?.minerPublicKey]);

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className={textStyles('h1', 'pb-0 mb-0')}>
          Stacks Block #{block.blockHeight.toLocaleString()}
        </h1>
        <Button variant="outline" size="sm" asChild>
          <Link
            to={getStacksExplorerUrl(
              `/block/${prefix0x(block.blockHash)}`,
              block.networkKey
            )}
            target="_blank"
          >
            <ExternalLinkIcon className="w-4 h-4 mr-2" />
            View in Explorer
          </Link>
        </Button>
      </div>

      {/* Status and Badges */}
      <div className="flex items-center gap-2 flex-wrap">
        {responseOutcome && (
          <div className="flex gap-2">
            <SimpleTooltip
              content={`${responseOutcome.acceptPercentString}% Accepted`}
            >
              <Badge variant="outline" className="text-green-600">
                ✓ {responseOutcome.acceptPercentString}%
              </Badge>
            </SimpleTooltip>
            <SimpleTooltip
              content={`${responseOutcome.rejectPercentString}% Rejected`}
            >
              <Badge variant="outline" className="text-red-600">
                ✗ {responseOutcome.rejectPercentString}%
              </Badge>
            </SimpleTooltip>
          </div>
        )}
        <TenureCauseBadge tenureCause={block.tenureChangeCause} />
        {block.txCount > 0 && (
          <Badge variant="outline">
            {block.txCount} transaction{block.txCount > 1 ? 's' : ''}
          </Badge>
        )}
        {block.txFees && (
          <Badge variant="outline">
            {microStxToStx(block.txFees).toFormat()} STX fees
          </Badge>
        )}
      </div>

      {/* Signer Responses */}
      <div className="space-y-3">
        <h2 className={textStyles('h3')}>Signer Responses</h2>
        <BlockListResponses blockHash={block.blockHash} />
      </div>

      {/* Response Timeline */}
      <ResponseTimelineChart
        blockHash={block.blockHash}
        proposedAt={block.proposedAt}
      />

      {/* Block Information */}
      <div className="space-y-3">
        <h2 className={textStyles('h3')}>Block Information</h2>
        <div className="grid gap-3 grid-cols-[minmax(140px,min-content)_1fr] items-center">
          <DataLabel>Block Hash</DataLabel>
          <DataValue>
            <PublicKey publicKey={block.blockHash} />
          </DataValue>

          <DataLabel>Block Height</DataLabel>
          <DataValue>{block.blockHeight.toLocaleString()}</DataValue>

          <DataLabel>Block Timestamp</DataLabel>
          <DataValue>
            <Timestamp timestamp={block.blockTimestamp} />
          </DataValue>

          {block.proposedAt && (
            <>
              <DataLabel>Proposed At</DataLabel>
              <DataValue>
                <Timestamp timestamp={block.proposedAt} />
              </DataValue>
            </>
          )}

          {block.processedAt && (
            <>
              <DataLabel>Processed At</DataLabel>
              <DataValue>
                <Timestamp timestamp={block.processedAt} />
              </DataValue>
            </>
          )}

          <DataLabel>Consensus Hash</DataLabel>
          <DataValue>
            <PublicKey publicKey={block.consensusHash} />
          </DataValue>

          <DataLabel>Burn Block Height</DataLabel>
          <DataValue>{block.burnBlockHeight.toLocaleString()}</DataValue>

          {block.burnBlockHash && (
            <>
              <DataLabel>Burn Block Hash</DataLabel>
              <DataValue>
                <PublicKey publicKey={block.burnBlockHash} />
              </DataValue>
            </>
          )}

          {block.burnBlockTimestamp && (
            <>
              <DataLabel>Burn Block Timestamp</DataLabel>
              <DataValue>
                <Timestamp timestamp={block.burnBlockTimestamp} />
              </DataValue>
            </>
          )}
          {block.indexBlockHash && (
            <>
              <DataLabel>Index Block Hash</DataLabel>
              <DataValue>
                <PublicKey publicKey={block.indexBlockHash} />
              </DataValue>
            </>
          )}
        </div>
      </div>

      {/* Miner Information */}
      <div className="space-y-3">
        <h2 className={textStyles('h3')}>Miner Information</h2>
        <div className="grid gap-3 grid-cols-[minmax(140px,min-content)_1fr] items-center">
          {block.minerPublicKey && (
            <>
              <DataLabel>Miner Public Key</DataLabel>
              <DataValue>
                <Link
                  to="/miners/$publicKey"
                  params={{ publicKey: block.minerPublicKey }}
                  className="hover:underline"
                >
                  <PublicKey publicKey={block.minerPublicKey} />
                </Link>
              </DataValue>
            </>
          )}

          {minerPkHash && (
            <>
              <DataLabel>Miner Address Hash</DataLabel>
              <DataValue>
                <PublicKey publicKey={minerPkHash} />
              </DataValue>
            </>
          )}

          <DataLabel>Node Version</DataLabel>
          <DataValue>{block.serverVersion || 'Unknown'}</DataValue>

          {block.serverVersionShort && (
            <>
              <DataLabel>Version Short</DataLabel>
              <DataValue>{block.serverVersionShort}</DataValue>
            </>
          )}
        </div>
      </div>

      {/* Block Costs and Performance */}
      {block.processedAt && (
        <div className="space-y-3">
          <h2 className={textStyles('h3')}>Block Performance</h2>
          <div className="grid gap-3 grid-cols-[minmax(140px,min-content)_1fr] items-center">
            {typeof block.readCount === 'number' && (
              <>
                <DataLabel>Read Count</DataLabel>
                <DataValue>
                  <div className="flex items-center gap-2">
                    <span>{block.readCount.toLocaleString()}</span>
                    <span>
                      (
                      {percentString(
                        block.readCount / MAINNET_COST_LIMITS.readCount
                      )}
                      %)
                    </span>
                  </div>
                </DataValue>

                <DataLabel>Read Length</DataLabel>
                <DataValue>
                  <div className="flex items-center gap-2">
                    <span>{block.readLength.toLocaleString()}</span>
                    <span>
                      (
                      {percentString(
                        block.readLength / MAINNET_COST_LIMITS.readLength
                      )}
                      %)
                    </span>
                  </div>
                </DataValue>

                <DataLabel>Write Count</DataLabel>
                <DataValue>
                  <div className="flex items-center gap-2">
                    <span>{block.writeCount.toLocaleString()}</span>
                    <span>
                      (
                      {percentString(
                        block.writeCount / MAINNET_COST_LIMITS.writeCount
                      )}
                      %)
                    </span>
                  </div>
                </DataValue>

                <DataLabel>Write Length</DataLabel>
                <DataValue>
                  <div className="flex items-center gap-2">
                    <span>{block.writeLength.toLocaleString()}</span>
                    <span>
                      (
                      {percentString(
                        block.writeLength / MAINNET_COST_LIMITS.writeLength,
                        10_000
                      )}
                      %)
                    </span>
                  </div>
                </DataValue>

                <DataLabel>Runtime</DataLabel>
                <DataValue>
                  <div className="flex items-center gap-2">
                    <span>{block.runtime.toLocaleString()}</span>
                    <span>
                      (
                      {percentString(
                        block.runtime / MAINNET_COST_LIMITS.runtime
                      )}
                      %)
                    </span>
                  </div>
                </DataValue>
              </>
            )}

            {blockCosts && (
              <>
                <DataLabel>Cumulative Cost Usage</DataLabel>
                <DataValue>
                  <BlockCosts costs={blockCosts.cumulative} />
                </DataValue>
              </>
            )}
          </div>
        </div>
      )}

      {/* Raw Data for Development */}
      {import.meta.env.DEV && (
        <details className="mt-6">
          <summary className="cursor-pointer text-sm text-muted-foreground">
            Raw Block Data (Development)
          </summary>
          <pre className="mt-2 text-xs bg-muted p-3 rounded overflow-auto">
            {JSON.stringify(block, null, 2)}
          </pre>
        </details>
      )}
    </div>
  );
}
