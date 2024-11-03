import type { ColumnDef } from '@tanstack/react-table';
import {
  knownSigners,
  percentString,
  type RecentSigner,
} from 'slot-watch-common';
import { TimeAgo } from '../time-ago';
import { SimpleTooltip } from '../simple-tooltip';
import { SortableHeader } from '../ui/data-table';
import { PublicKey } from '../public-key';
import { InfoCircledIcon } from '@radix-ui/react-icons';
import React from 'react';
import { textVariants } from '@/lib/text-variants';

function Degregation({
  degradation,
  lastNBlocks,
}: { degradation: number; lastNBlocks: number }) {
  const status = React.useMemo(() => {
    if (degradation > 0.6) return 'error';
    if (degradation > 0.2) return 'warning';
    return 'success';
  }, [degradation]);
  return (
    <div className="ml-4">
      <SimpleTooltip content={`Last ${lastNBlocks} blocks`}>
        <span className={textVariants({ status })}>
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
      return <div className="font-mono ml-4">{row.original.slotId}</div>;
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
      return <PublicKey publicKey={row.original.publicKey} />;
    },
  },
  {
    header: 'Entity',
    // accessorKey: "entity",
    cell: ({ row }) => {
      return <span>{knownSigners[row.original.publicKey]}</span>;
    },
  },
  {
    // header: "Signing Power",
    cell: ({ row }) => {
      return (
        <div className="font-mono ml-4">{row.original.weightPercentStr}%</div>
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
    invertSorting: true,
    sortDescFirst: false,
    accessorKey: 'degradation10',
    header: ({ column }) => {
      return (
        <SortableHeader column={column}>
          Health (10)
          <SimpleTooltip content="Health of the signer over the last 10 block proposals">
            <InfoCircledIcon className="ml-2 h-3 w-3" />
          </SimpleTooltip>
        </SortableHeader>
      );
    },
    cell: ({ row }) => {
      return (
        <Degregation
          degradation={row.original.degradation10}
          lastNBlocks={10}
        />
      );
    },
  },
  {
    accessorKey: 'degradation25',
    invertSorting: true,
    sortDescFirst: false,
    header: ({ column }) => {
      return (
        <SortableHeader column={column}>
          Health (25)
          <SimpleTooltip content="Health of the signer over the last 25 block proposals">
            <InfoCircledIcon className="ml-2 h-3 w-3" />
          </SimpleTooltip>
        </SortableHeader>
      );
    },
    cell: ({ row }) => {
      return (
        <Degregation
          degradation={row.original.degradation25}
          lastNBlocks={25}
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
          <TimeAgo date={row.original.createdAt} className="ml-4" />
        </SimpleTooltip>
      );
      // return <TimeAgo date={row.original.createdAt} className="ml-4" />;
    },
    header: ({ column }) => {
      return <SortableHeader column={column}>Last Seen</SortableHeader>;
    },
  },
  {
    header: 'Version',
    // sortingFn: (a, b) => {
    //   return a.original.version.localeCompare(b.original.version);
    // },
    // accessorKey: "versionShort",
    cell: ({ row }) => {
      return (
        <SimpleTooltip content={row.original.version}>
          {row.original.versionShort}
        </SimpleTooltip>
      );
    },
  },
];
