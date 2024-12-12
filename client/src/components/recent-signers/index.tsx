import 'react';
import { useAtomValue } from 'jotai';
import {
  recentSignersAtom,
  totalRecentSignersAtom,
  totalUpatedSignersAtom,
} from '@/store/signers-store';
import { colord, extend } from 'colord';
import { differenceInSeconds, parseISO } from 'date-fns';
import mixPlugin from 'colord/plugins/mix';
import { textVariants } from '@/lib/text-variants';
import { networkIdAtom } from '@/store/network';
import { DataTable } from '../ui/data-table';
import { columns } from './columns';

extend([mixPlugin]);

const okColor = colord('#00c221');
const badColor = colord('#ff2600');

function colorForTimeAgo(timeAgo: string | null) {
  if (timeAgo === null) return badColor.toHex();
  const date = parseISO(timeAgo);
  const diff = differenceInSeconds(new Date(), date);
  const maxDiff = 60 * 60; // 1 hour
  const ratio = Math.min(diff / maxDiff, 1);
  return okColor.mix(badColor, ratio).toHex();
}

const MAINNET_LAUNCHED = true;

export const RecentSigners = () => {
  const recentSigners = useAtomValue(recentSignersAtom);
  const totalRecents = useAtomValue(totalRecentSignersAtom);
  const totalUpdated = useAtomValue(totalUpatedSignersAtom);
  const networkId = useAtomValue(networkIdAtom);
  const showCustom = !MAINNET_LAUNCHED && networkId === 'mainnet';

  return (
    <div className="flex flex-col gap-2">
      <div className="flex w-full py-10">
        <div className="flex-1 flex flex-col gap-0">
          <h2 className={textVariants({ variant: 'h2' })}>
            {showCustom ? totalUpdated.percentStr : totalRecents.percentStr}%
          </h2>
          <p className={textVariants({ variant: 'muted' })}>
            Percent of signer weight{' '}
            {showCustom ? 'updated' : 'active in last 10 minutes'}
          </p>
        </div>
        <div className="flex-1 flex flex-col gap-0">
          <h2 className={textVariants({ variant: 'h2' })}>
            {showCustom ? totalUpdated.numSigners : totalRecents.numSigners}
            <span className="opacity-50 mx-2">/</span>
            {recentSigners.signers.length}
          </h2>
          <p className={textVariants({ variant: 'muted' })}>
            Number of signers{' '}
            {showCustom ? 'updated' : 'active in last 10 minutes'}
          </p>
        </div>
        <div className="flex-1 flex flex-col gap-0">
          <h2 className={textVariants({ variant: 'h2' })}>
            {recentSigners.rewardCycle}
          </h2>
          <p className={textVariants({ variant: 'muted' })}>Reward Cycle</p>
        </div>
      </div>
      {showCustom ? null : (
        <div className="w-full rounded-md h-10 border border-border flex overflow-hidden mb-8 gap-[2px]">
          {recentSigners.signers.map((s) => {
            const color = colorForTimeAgo(s.createdAt);
            return (
              <div
                key={s.publicKey}
                className="h-full"
                style={{
                  // width: `${s.power * 100}%`,
                  flexGrow: s.weight + recentSigners.total * 0.01,
                  backgroundColor: color,
                }}
              />
            );
          })}
        </div>
      )}
      <DataTable columns={columns} data={recentSigners.signers} />
      {/* <Table>
        <TableHeader>
          <TableRow>
            <TableHead>#</TableHead>
            <TableHead>Public Key</TableHead>
            <TableHead>Entity</TableHead>
            <TableHead>Signing Power</TableHead>
            <TableHead>Last Seen</TableHead>
            <TableHead>Version</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {recentSigners.signers.map((signer) => {
            return <RecentSignerRow key={signer.publicKey} signer={signer} />;
          })}
        </TableBody>
      </Table> */}
    </div>
  );
};
