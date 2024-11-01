import type { ColumnDef, SortingColumn } from '@tanstack/react-table';
import { knownSigners, type RecentSigner } from 'slot-watch-common';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '../ui/tooltip';
import { useToast } from '@/hooks/use-toast';
import { useCopyToClipboard } from 'usehooks-ts';
import { textVariants } from '@/lib/text-variants';
import { TimeAgo } from '../time-ago';
import { SimpleTooltip } from '../simple-tooltip';
import { Button } from '../ui/button';
import { ArrowDownIcon, ArrowUpIcon } from '@radix-ui/react-icons';
import { SortableHeader } from '../ui/data-table';
import { cn } from '@/lib/utils';

const PublicKeyCell = ({ publicKey }: { publicKey: string }) => {
  const { toast } = useToast();
  const [_, copy] = useCopyToClipboard();
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger
          className="cursor-pointer"
          onClick={() => {
            copy(publicKey);
            toast({
              title: 'Copied to clipboard',
            });
          }}
        >
          <code
            className={cn(
              textVariants({ variant: 'code' }),
              'max-w-[90px] text-nowrap text-ellipsis inline-block overflow-clip',
            )}
          >
            {publicKey}
          </code>
        </TooltipTrigger>
        <TooltipContent>
          <p>{publicKey}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
};

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
      return <PublicKeyCell publicKey={row.original.publicKey} />;
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
