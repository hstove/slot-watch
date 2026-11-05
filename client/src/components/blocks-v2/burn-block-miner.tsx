import { Link } from '@tanstack/react-router';
import { type BurnBlockMiner, minerDisplay } from 'slot-watch-common';
import { formatBtc } from '@/lib/miner-economics';
import { MinerNameTag } from '../miners/miner-identity';
import { PublicKey } from '../public-key';
import { SimpleTooltip } from '../simple-tooltip';
import { Text } from '../text';

function MinerField({
  label,
  hint,
  children,
}: {
  label: string;
  hint: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-2">
      <SimpleTooltip content={hint}>
        <Text variant="small" className="text-muted-foreground font-normal">
          {label}
        </Text>
      </SimpleTooltip>
      {children}
    </div>
  );
}

/** The sortition winner for a burn block, linking to its miner page. */
export function BurnBlockMinerInfo({
  miner,
  winningTxid,
  network,
}: {
  miner: BurnBlockMiner;
  winningTxid: string | null;
  network: string;
}) {
  const identity = minerDisplay(miner);
  const minerKey = miner.commitPublicKey ?? miner.signingPublicKey;
  return (
    <div className="flex flex-wrap items-center gap-x-6 gap-y-2 border-b border-border px-4 py-3">
      <MinerField label="Miner" hint="Winner of this block's sortition">
        {minerKey && identity ? (
          <Link
            to="/miners/$publicKey"
            params={{ publicKey: minerKey }}
            search={{ network }}
            className="hover:underline"
          >
            <Text variant="small">
              <MinerNameTag identity={identity} />
            </Text>
          </Link>
        ) : (
          <Text variant="small" className="text-muted-foreground">
            unresolved
          </Text>
        )}
      </MinerField>
      {miner.signingPublicKey ? (
        <MinerField
          label="Signing key"
          hint="Key that signed this tenure's block proposals"
        >
          <PublicKey publicKey={miner.signingPublicKey} />
        </MinerField>
      ) : null}
      {miner.commitBtcAddress ? (
        <MinerField
          label="BTC address"
          hint="Bitcoin address that funded the winning block commit"
        >
          <PublicKey publicKey={miner.commitBtcAddress} />
        </MinerField>
      ) : null}
      {winningTxid ? (
        <MinerField label="Commit" hint="Winning block commit transaction">
          <PublicKey publicKey={winningTxid} />
        </MinerField>
      ) : null}
      {miner.commitSpendSats !== null ? (
        <MinerField
          label="Spend"
          hint="Winning commit's total spend (PoX payouts + burn)"
        >
          <Text variant="small">{formatBtc(miner.commitSpendSats)}</Text>
        </MinerField>
      ) : null}
    </div>
  );
}
