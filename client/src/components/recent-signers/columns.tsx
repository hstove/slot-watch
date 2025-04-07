import type { ColumnDef } from '@tanstack/react-table';
import {
  getSortableVersion,
  percentString,
  versionSort,
  type RecentSigner,
} from 'slot-watch-common';
import { SimpleTooltip } from '../simple-tooltip';
import { SortableHeader } from '../ui/data-table';
import { PublicKey } from '../public-key';
import { InfoCircledIcon } from '@radix-ui/react-icons';
import React from 'react';
import { textVariants } from '@/lib/text-variants';
import { useEntity } from '@/hooks/use-entity';
import { Timestamp } from '../timestamp';
import { cn } from '@/lib/utils';
import { Text } from '@/components/text';
function Degregation({
  degradation,
  lastNBlocks,
  className,
}: { degradation: number; lastNBlocks: number; className?: string }) {
  const status = React.useMemo(() => {
    if (degradation > 0.6) return 'error';
    if (degradation > 0.2) return 'warning';
    return 'success';
  }, [degradation]);
  return (
    <div className={cn('ml-4', className)}>
      <SimpleTooltip content={`Last ${lastNBlocks} blocks`}>
        <span className={textVariants({ status, className: 'text-xs' })}>
          {percentString(1 - degradation)}%
        </span>
      </SimpleTooltip>
    </div>
  );
}

export const columns: ColumnDef<RecentSigner>[] = [
  {
    // header: "#",
    accessorKey: 'slotId',
    cell: ({ row }) => {
      return <div className="font-mono ml-2">{row.original.slotId}</div>;
    },
    header: ({ column }) => {
      return (
        <div className="flex w-full">
          <SortableHeader column={column}>#</SortableHeader>
        </div>
      );
    },
  },
  {
    header: 'Public Key',
    // accessorKey: "publicKey",
    cell: ({ row }) => {
      return (
        <div className="text-xs">
          <PublicKey
            publicKey={row.original.publicKey}
            className="max-w-[70px]"
          />
        </div>
      );
    },
  },
  {
    header: 'Entity',
    // accessorKey: "entity",
    cell: ({ row }) => {
      const entity = useEntity(row.original.publicKey);
      return (
        <Text variant="small" className="text-xs">
          {entity ?? ''}
        </Text>
      );
    },
  },
  {
    // header: "Signing Power",
    cell: ({ row }) => {
      return (
        <div className="font-mono ml-2 text-xs">
          {row.original.weightPercentStr}%
        </div>
      );
    },
    accessorKey: 'weightPercent',
    sortingFn: 'auto',
    sortDescFirst: true,
    header: ({ column }) => {
      return (
        <div className="flex w-full">
          <SortableHeader column={column}>Signing Power</SortableHeader>
        </div>
      );
    },
  },
  {
    header: 'Health (10)',
    id: 'degradation10',
    cell: ({ row }) => {
      return (
        <Degregation
          degradation={row.original.degradation10}
          lastNBlocks={10}
          className="ml-0"
        />
      );
    },
  },
  {
    header: 'Health (25)',
    id: 'degradation25',
    cell: ({ row }) => {
      return (
        <Degregation
          degradation={row.original.degradation25}
          lastNBlocks={25}
          className="ml-0 text-xs"
        />
      );
    },
  },
  {
    accessorKey: 'degradation50',
    invertSorting: true,
    sortDescFirst: false,
    header: ({ column }) => {
      return (
        <SortableHeader column={column}>
          Health (50)
          <SimpleTooltip content="Health of the signer over the last 50 block proposals">
            <InfoCircledIcon className="ml-2 h-3 w-3" />
          </SimpleTooltip>
        </SortableHeader>
      );
    },
    cell: ({ row }) => {
      return (
        <Degregation
          degradation={row.original.degradation50}
          lastNBlocks={50}
          className="ml-2 text-xs"
        />
      );
    },
  },
  {
    accessorKey: 'createdAt',
    sortDescFirst: true,
    sortingFn: (a, b) => {
      const aTime = new Date(a.original.createdAt ?? 0);
      const bTime = new Date(b.original.createdAt ?? 0);
      return aTime.getTime() - bTime.getTime();
    },
    cell: ({ row }) => {
      if (!row.original.createdAt) return null;
      const date = new Date(row.original.createdAt);
      return (
        <SimpleTooltip
          content={date.toLocaleString(undefined, {
            timeStyle: 'long',
            dateStyle: 'long',
          })}
        >
          {/* <TimeAgo date={row.original.createdAt} className="ml-4" /> */}
          <Timestamp
            timestamp={row.original.createdAt}
            className="text-xs ml-2"
          />
        </SimpleTooltip>
      );
      // return <TimeAgo date={row.original.createdAt} className="ml-4" />;
    },
    header: ({ column }) => {
      return <SortableHeader column={column}>Last Seen</SortableHeader>;
    },
  },
  {
    header: ({ column }) => {
      return <SortableHeader column={column}>Version</SortableHeader>;
    },
    sortingFn: (a, b) => {
      const aVersion = getSortableVersion(a.original.versionShort);
      const bVersion = getSortableVersion(b.original.versionShort);
      return versionSort(aVersion, bVersion);
    },
    id: 'versionCmp',
    accessorFn: (row) => {
      return getSortableVersion(row.versionShort);
    },
    cell: ({ row }) => {
      return (
        <SimpleTooltip content={row.original.version}>
          <Text variant="small" className="text-xs ml-3">
            {row.original.versionShort}
          </Text>
        </SimpleTooltip>
      );
    },
  },
];
