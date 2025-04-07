import React from 'react';
import { useAtom, useAtomValue } from 'jotai';
import {
  recentSignersAtom,
  totalRecentSignersAtom,
  useSignerVersionsWeightedAtom,
} from '@/store/signers-store';
import { colord, extend } from 'colord';
import { differenceInSeconds, parseISO } from 'date-fns';
import mixPlugin from 'colord/plugins/mix';
import { textVariants } from '@/lib/text-variants';
import { networkIdAtom } from '@/store/network';
import { DataTable } from '../ui/data-table';
import { columns } from './columns';
import { VersionsChart } from './versions-chart';
import { Card, CardContent } from '../ui/card';
import { Badge } from '../ui/badge';
import { Route } from '../../routes/signers';

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

const MAINNET_LAUNCHED = true;

export const RecentSigners = () => {
  const totalRecents = useAtomValue(totalRecentSignersAtom);
  const networkId = useAtomValue(networkIdAtom);
  const loaderData = Route.useLoaderData();
  const [recentSigners, setRecentSigners] = useAtom(recentSignersAtom);
  const [useWeighted, setUseWeighted] = useAtom(useSignerVersionsWeightedAtom);
  const showCustom = !MAINNET_LAUNCHED && networkId === 'mainnet';
  React.useEffect(() => {
    setRecentSigners(loaderData.signers);
  }, [loaderData, setRecentSigners]);

  const columnVisibility = React.useMemo(() => {
    if (networkId !== 'mainnet') {
      return {
        degradation10: false,
        degradation25: false,
        degradation50: false,
      };
    }
    return undefined;
  }, [networkId]);

  if (!recentSigners) return null;

  return (
    <div className="flex flex-col gap-2">
      <div className="grid grid-cols-1 md:grid-cols-3 auto-cols-fr gap-3">
        <Card className="flex flex-col items-center pt-5">
          {/* <CardHeader /> */}
          <CardContent className="w-full flex flex-col items-center flex-1">
            <div className="flex-1 items-center" />

            <h2 className={textVariants({ variant: 'h2' })}>
              {totalRecents.percentStr}%
            </h2>
            <div className="flex-1 items-center" />
            <p className={textVariants({ variant: 'muted' })}>
              Percent of signer weight active in last 10 minutes
            </p>
          </CardContent>
        </Card>
        <Card className="flex flex-col items-center pt-5">
          {/* <CardHeader /> */}
          <CardContent className="w-full flex flex-col items-center flex-1">
            <div className="flex-1 items-center" />
            <h2 className={textVariants({ variant: 'h2' })}>
              {totalRecents.numSigners}
              <span className="opacity-50 mx-2">/</span>
              {recentSigners.signers.length}
            </h2>
            <div className="flex-1 items-center" />

            <p className={textVariants({ variant: 'muted' })}>
              Number of signers active in last 10 minutes
            </p>
          </CardContent>
        </Card>
        <Card className="flex flex-col items-center pt-5">
          <CardContent className="w-full flex flex-col items-center">
            <React.Suspense>
              <VersionsChart />
            </React.Suspense>
            <div className="flex gap-2">
              <p className={textVariants({ variant: 'muted' })}>
                Signer versions
              </p>
              <Badge
                size={'icon'}
                variant="outline"
                className="cursor-pointer"
                onClick={() => {
                  setUseWeighted((cur) => !cur);
                }}
              >
                {useWeighted ? 'Weighted' : 'Raw'}
              </Badge>
            </div>
          </CardContent>
        </Card>
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
                  flexGrow: s.weight + recentSigners.totalWeight * 0.01,
                  backgroundColor: color,
                }}
              />
            );
          })}
        </div>
      )}
      <DataTable
        columns={columns}
        data={recentSigners.signers}
        columnVisibility={columnVisibility}
      />
    </div>
  );
};
