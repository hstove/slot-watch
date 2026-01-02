import type { ColumnDef } from '@tanstack/react-table';
import { PublicKey } from '../public-key';
import type { FullSignerStateMachine } from '@/store/state-machine-store';
import { Text } from '@/components/text';
import { useEntity } from '@/hooks/use-entity';
import { SimpleTooltip } from '../simple-tooltip';
import { Timestamp } from '../timestamp';
import { SortableHeader } from '../ui/data-table';

export const stateMachineColumns: ColumnDef<FullSignerStateMachine>[] = [
  {
    header: 'Signer',
    accessorKey: 'signer.publicKey',
    enableSorting: false,
    cell: ({ row }) => {
      return <PublicKey publicKey={row.original.signer.publicKey} />;
    },
  },
  {
    header: 'Entity',
    enableSorting: false,
    // accessorKey: 'signer.entity',
    cell: ({ row }) => {
      const entity = useEntity(row.original.signer.publicKey);
      return (
        <Text variant="small" className="text-xs">
          {entity}
        </Text>
      );
    },
  },
  {
    // header: 'Signing Power',
    cell: ({ row }) => {
      return (
        <div className="font-mono text-xs">
          {row.original.signer.weightPercentStr}%
        </div>
      );
    },
    accessorKey: 'signer.weightPercent',
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
  // {
  //   header: 'Active Version',
  //   accessorKey: 'stateMachine.activeSignerProtocolVersion',
  //   cell: ({ row }) => {
  //     return (
  //       <span>{row.original.stateMachine?.activeSignerProtocolVersion}</span>
  //     );
  //   },
  // },
  {
    header: 'Version (Local/Active)',
    accessorKey: 'stateMachine.localSignerProtocolVersion',
    enableSorting: false,
    cell: ({ row }) => {
      const { stateMachine } = row.original;
      if (!stateMachine) return null;
      return (
        <span>
          {stateMachine.localSignerProtocolVersion} /{' '}
          {stateMachine.activeSignerProtocolVersion}
        </span>
      );
    },
  },
  {
    header: 'Miner Pubkey',
    accessorKey: 'stateMachine.minerState.currentMinerPkh',
    enableSorting: false,
    cell: ({ row }) => {
      if (!row.original.stateMachine) return null;
      if (row.original.stateMachine?.minerState.variant !== 1) {
        return <span className="text-xs">N/A</span>;
      }
      return (
        <PublicKey
          publicKey={row.original.stateMachine.minerState.currentMinerPkh}
        />
      );
    },
  },
  {
    accessorFn: (row) => {
      return row.stateMachine?.createdAt ?? new Date(0).toISOString();
    },
    id: 'createdAt',
    sortDescFirst: true,
    sortingFn: 'datetime',
    cell: ({ row }) => {
      if (!row.original.stateMachine?.createdAt) return null;
      const date = new Date(row.original.stateMachine.createdAt);
      return (
        <SimpleTooltip
          content={date.toLocaleString(undefined, {
            timeStyle: 'long',
            dateStyle: 'long',
          })}
        >
          {/* <TimeAgo date={row.original.createdAt} className="ml-4" /> */}
          <Timestamp
            timestamp={row.original.stateMachine.createdAt}
            className="text-xs"
          />
        </SimpleTooltip>
      );
      // return <TimeAgo date={row.original.createdAt} className="ml-4" />;
    },
    // header: 'Last Updated',
    header: ({ column }) => {
      return <SortableHeader column={column}>Updated</SortableHeader>;
    },
  },
  {
    header: 'Burn block height',
    cell: ({ row }) => {
      return (
        <div className="font-mono text-xs">
          {row.original.stateMachine?.burnBlockHeight}
        </div>
      );
    },
    enableSorting: false,
  },
  {
    header: 'Burn block',
    cell: ({ row }) => {
      if (!row.original.stateMachine?.burnBlock) return null;
      return (
        <PublicKey publicKey={row.original.stateMachine?.burnBlock} />
        // <div className="font-mono text-xs">{row.original.stateMachine?.burnBlock}</div>
      );
    },
    enableSorting: false,
  },
];
