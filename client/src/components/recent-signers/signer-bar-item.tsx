import { colord, extend } from 'colord';
import { differenceInSeconds, parseISO } from 'date-fns';
import mixPlugin from 'colord/plugins/mix';
import type { RecentSignerWithLatestResponse } from '@/store/signers-store';

extend([mixPlugin]);

const okColor = colord('#15803d');
const badColor = colord('#b91c1c');

function colorForTimeAgo(timeAgo: string | null) {
  if (timeAgo === null) return badColor.toHex();
  const date = parseISO(timeAgo);
  const diff = differenceInSeconds(new Date(), date);
  const maxDiff = 60 * 60; // 1 hour
  const ratio = Math.min(diff / maxDiff, 1);
  return okColor.mix(badColor, ratio).toHex();
}

export const SignerBarItem = ({
  signer,
}: {
  signer: RecentSignerWithLatestResponse;
}) => {
  const color = colorForTimeAgo(signer.createdAt);
  return (
    <div
      key={signer.publicKey}
      className="h-full"
      style={{
        flexGrow: signer.weight + signer.totalWeight * 0.01,
        backgroundColor: color,
      }}
    />
  );
};
