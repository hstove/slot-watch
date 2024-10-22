import "react";
import { useAtomValue } from "jotai";
import { recentSignersAtom } from "@/store/signers";
import { knownSigners } from "slot-watch-common";
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { TimeAgo } from "../time-ago";
import { RecentSignerRow } from "./recent-signer-row";
import { colord, extend } from "colord";
import { differenceInSeconds, parseISO } from "date-fns";
import mixPlugin from "colord/plugins/mix";

extend([mixPlugin]);

const okColor = colord("#00c221");
const badColor = colord("#ff2600");

function colorForTimeAgo(timeAgo: string | null) {
  if (timeAgo === null) return badColor.toHex();
  const date = parseISO(timeAgo);
  const diff = differenceInSeconds(new Date(), date);
  const maxDiff = 60 * 60; // 1 hour
  const ratio = Math.min(diff / maxDiff, 1);
  return okColor.mix(badColor, ratio).toHex();
}

export const RecentSigners = () => {
  const recentSigners = useAtomValue(recentSignersAtom);

  return (
    <div className="flex flex-col gap-2">
      <div className="w-full rounded-md h-10 border border-border flex overflow-hidden">
        {recentSigners.signers.map((s) => {
          const color = colorForTimeAgo(s.createdAt);
          return (
            <div
              key={s.publicKey}
              className="h-full border-r border-background last:border-none box-border"
              style={{
                // width: `${s.power * 100}%`,
                flexGrow: s.power,
                backgroundColor: color,
              }}
            />
          );
        })}
      </div>
      <Table>
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
      </Table>
    </div>
  );
};
