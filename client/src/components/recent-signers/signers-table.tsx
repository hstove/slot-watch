import React from 'react';
import {
  type Column,
  type ColumnDef,
  getCoreRowModel,
  getSortedRowModel,
  type SortingState,
  useReactTable,
} from '@tanstack/react-table';
import {
  ArrowDownIcon,
  ArrowUpIcon,
  ChevronDownIcon,
  CopyIcon,
  ExternalLinkIcon,
  Pencil1Icon,
} from '@radix-ui/react-icons';
import { useAtomValue } from 'jotai';
import { differenceInSeconds, format, isToday } from 'date-fns';
import {
  getSortableVersion,
  getStacksExplorerUrl,
  percentString,
  versionSort,
} from 'slot-watch-common';
import type { RecentSignerWithLatestResponse } from '@/store/signers-store';
import { useToast } from '@/hooks/use-toast';
import { useEntity } from '@/hooks/use-entity';
import { isKnownSigner, saveSigner } from '@/lib/local-signers';
import { cn, truncateMiddle } from '@/lib/utils';
import { useCopyToClipboard } from 'usehooks-ts';
import { networkIdAtom } from '@/store/network';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { SimpleTooltip } from '../simple-tooltip';
import { RenameSignerDialog } from './rename-signer-dialog';

const gridClassName =
  'grid grid-cols-[minmax(0,1fr)_auto] md:grid-cols-[minmax(0,1.35fr)_minmax(0,1.5fr)_5.5rem_5rem_6.5rem_minmax(7.5rem,0.9fr)]';

function SortHeader({
  column,
  children,
  align = 'left',
}: {
  column?: Column<RecentSignerWithLatestResponse>;
  children: React.ReactNode;
  align?: 'left' | 'right';
}) {
  const sorted = column?.getIsSorted();
  let sortIcon: React.ReactNode;
  if (sorted === 'asc') sortIcon = <ArrowUpIcon className="h-3 w-3" />;
  if (sorted === 'desc') sortIcon = <ArrowDownIcon className="h-3 w-3" />;
  return (
    <button
      type="button"
      className={cn(
        'flex h-full w-full items-center gap-1 font-mono text-[10px] uppercase tracking-wider text-muted-foreground transition-colors hover:text-foreground',
        align === 'right' && 'justify-end text-right'
      )}
      onClick={column?.getToggleSortingHandler()}
    >
      {children}
      {sortIcon}
    </button>
  );
}

function SignerIdentity({
  signer,
}: {
  signer: RecentSignerWithLatestResponse;
}) {
  const [renameOpen, setRenameOpen] = React.useState(false);
  const localEntity = useEntity(signer.publicKey);
  const entity = localEntity ?? signer.name;
  const canRename = !(isKnownSigner(signer.publicKey) || signer.name);

  return (
    <div className="flex min-w-0 items-center gap-2.5">
      <span className="flex h-6 w-6 shrink-0 items-center justify-center border border-border bg-muted/30 font-mono text-[10px] text-muted-foreground">
        {String(signer.slotId).padStart(2, '0')}
      </span>
      <div className="min-w-0">
        <div className="flex min-w-0 items-center gap-1">
          <div
            className={cn(
              'truncate text-xs font-medium leading-4',
              !entity && 'font-mono text-muted-foreground'
            )}
          >
            {entity ?? 'unknown'}
          </div>
          {canRename ? (
            <SimpleTooltip content={entity ? 'rename signer' : 'name signer'}>
              <button
                type="button"
                className={cn(
                  'shrink-0 text-muted-foreground transition-opacity hover:text-foreground [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover:opacity-100 [@media(hover:hover)]:focus-visible:opacity-100',
                  renameOpen && '[@media(hover:hover)]:opacity-100'
                )}
                aria-label={entity ? 'rename signer' : 'name signer'}
                onClick={() => setRenameOpen(true)}
              >
                <Pencil1Icon className="h-3 w-3" />
              </button>
            </SimpleTooltip>
          ) : null}
        </div>
        <CompactIdentifier value={signer.publicKey} head={8} tail={6} />
      </div>
      {canRename ? (
        <RenameSignerDialog
          open={renameOpen}
          onOpenChange={setRenameOpen}
          publicKey={signer.publicKey}
          currentName={entity ?? undefined}
          onSave={(name) => saveSigner(signer.publicKey, name)}
        />
      ) : null}
    </div>
  );
}

function CompactIdentifier({
  value,
  head,
  tail,
}: {
  value: string;
  head: number;
  tail: number;
}) {
  const { toast } = useToast();
  const [, copy] = useCopyToClipboard();

  return (
    <SimpleTooltip content={value}>
      <button
        type="button"
        className="block max-w-full truncate font-mono text-[10px] leading-3 text-muted-foreground transition-colors hover:text-foreground"
        onClick={() => {
          copy(value);
          toast({ title: 'Copied to clipboard' });
        }}
      >
        {truncateMiddle(value, head, tail)}
      </button>
    </SimpleTooltip>
  );
}

function contractNameOf(principal: string) {
  const separator = principal.lastIndexOf('.');
  return separator === -1 ? principal : principal.slice(separator + 1);
}

function SignerManager({ signer }: { signer: RecentSignerWithLatestResponse }) {
  const [primary, ...others] = signer.signerManagers;
  if (!primary) {
    return (
      <span className="font-mono text-[10px] text-muted-foreground/60">
        not reported
      </span>
    );
  }

  return (
    <div className="min-w-0 border-l-2 border-primary/50 pl-2">
      <div className="flex min-w-0 items-center gap-1.5">
        <div className="truncate font-mono text-xs font-medium leading-4 text-foreground">
          {contractNameOf(primary)}
        </div>
        {others.length > 0 ? (
          <SignerManagersPopover managers={signer.signerManagers} />
        ) : null}
      </div>
      <CompactIdentifier value={primary} head={9} tail={9} />
    </div>
  );
}

function SignerManagersPopover({ managers }: { managers: string[] }) {
  const [open, setOpen] = React.useState(false);
  const closeTimer = React.useRef<ReturnType<typeof setTimeout>>(undefined);
  const networkKey = useAtomValue(networkIdAtom);
  const { toast } = useToast();
  const [, copy] = useCopyToClipboard();

  const show = () => {
    clearTimeout(closeTimer.current);
    setOpen(true);
  };
  const hide = () => {
    closeTimer.current = setTimeout(() => setOpen(false), 150);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            'flex h-4 shrink-0 items-center gap-0.5 border border-border px-1 font-mono text-[10px] leading-none text-muted-foreground transition-colors hover:border-primary/60 hover:text-foreground',
            open && 'border-primary/60 text-foreground'
          )}
          aria-label={`${managers.length} signer manager contracts`}
          onPointerEnter={(e) => e.pointerType === 'mouse' && show()}
          onPointerLeave={(e) => e.pointerType === 'mouse' && hide()}
          onClick={(e) => {
            if ((e.nativeEvent as PointerEvent).pointerType === 'mouse') {
              e.preventDefault();
              show();
            }
          }}
        >
          +{managers.length - 1}
          <ChevronDownIcon className="h-2.5 w-2.5" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-auto max-w-[min(34rem,calc(100vw-2rem))] rounded-none p-0"
        onPointerEnter={show}
        onPointerLeave={hide}
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        <div className="border-b border-border bg-muted/20 px-3 py-1.5 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
          {managers.length} signer managers
        </div>
        <ul>
          {managers.map((manager) => (
            <li
              key={manager}
              className="flex items-center gap-3 border-b border-border/70 px-3 py-1.5 last:border-b-0"
            >
              <div className="min-w-0 flex-1 border-l-2 border-primary/50 pl-2">
                <div className="truncate font-mono text-xs font-medium leading-4">
                  {contractNameOf(manager)}
                </div>
                <div className="truncate font-mono text-[10px] leading-3 text-muted-foreground">
                  {manager}
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-0.5">
                <button
                  type="button"
                  className="p-1 text-muted-foreground transition-colors hover:text-foreground"
                  aria-label="copy contract"
                  onClick={() => {
                    copy(manager);
                    toast({ title: 'Copied to clipboard' });
                  }}
                >
                  <CopyIcon className="h-3 w-3" />
                </button>
                <a
                  href={getStacksExplorerUrl(`/txid/${manager}`, networkKey)}
                  target="_blank"
                  rel="noreferrer"
                  className="p-1 text-muted-foreground transition-colors hover:text-foreground"
                  aria-label="view in explorer"
                >
                  <ExternalLinkIcon className="h-3 w-3" />
                </a>
              </div>
            </li>
          ))}
        </ul>
      </PopoverContent>
    </Popover>
  );
}

function SigningPower({ signer }: { signer: RecentSignerWithLatestResponse }) {
  const width = Math.max(Math.min(signer.weightPercent * 100, 100), 1.5);
  return (
    <div className="w-[5.5rem] md:w-auto">
      <div className="text-right font-mono text-xs font-medium tabular-nums">
        {signer.weightPercentStr}%
      </div>
      <div className="mt-1 ml-auto h-1 w-full bg-muted">
        <div className="h-full bg-primary/70" style={{ width: `${width}%` }} />
      </div>
    </div>
  );
}

function Health({ degradation }: { degradation: number }) {
  const health = 1 - degradation;
  let status = 'bg-red-500';
  if (health >= 0.8) status = 'bg-green-500';
  else if (health >= 0.4) status = 'bg-amber-500';

  return (
    <SimpleTooltip content="Health over the last 50 block proposals">
      <div className="flex items-center justify-end gap-1.5 font-mono text-xs tabular-nums">
        {percentString(health)}%
        <span className={cn('h-1.5 w-1.5 shrink-0', status)} />
      </div>
    </SimpleTooltip>
  );
}

function Activity({ signer }: { signer: RecentSignerWithLatestResponse }) {
  const lastSeen = signer.createdAt ? new Date(signer.createdAt) : null;
  const secondsAgo = signer.createdAt
    ? differenceInSeconds(new Date(), signer.createdAt)
    : null;
  const hasBadActivity = secondsAgo === null || secondsAgo > 60 * 60;
  const visibleTimestamp = lastSeen
    ? format(lastSeen, isToday(lastSeen) ? 'HH:mm:ss' : 'MMM d · HH:mm')
    : null;

  return (
    <div className="min-w-0 text-right md:text-left">
      <div className="flex items-center justify-end gap-1.5 font-mono text-xs md:justify-start">
        {hasBadActivity ? (
          <span className="h-1.5 w-1.5 shrink-0 bg-red-500" />
        ) : null}
        {lastSeen && visibleTimestamp ? (
          <SimpleTooltip
            content={lastSeen.toLocaleString(undefined, {
              dateStyle: 'full',
              timeStyle: 'long',
            })}
          >
            <span className="tabular-nums">{visibleTimestamp}</span>
          </SimpleTooltip>
        ) : (
          <span className="text-muted-foreground">not seen</span>
        )}
      </div>
      <div className="mt-0.5 truncate font-mono text-[10px] leading-4 text-muted-foreground">
        {signer.blockHeight
          ? `#${signer.blockHeight.toLocaleString()}`
          : 'no block'}
      </div>
    </div>
  );
}

function Version({ signer }: { signer: RecentSignerWithLatestResponse }) {
  const hasVersion = signer.versionShort && signer.versionShort !== 'No';
  const label = hasVersion ? `v${signer.versionShort}` : 'unknown';

  if (!signer.version) {
    return (
      <span className="font-mono text-xs text-muted-foreground">{label}</span>
    );
  }

  return (
    <SimpleTooltip content={signer.version}>
      <span className="block truncate font-mono text-xs text-muted-foreground">
        {label}
      </span>
    </SimpleTooltip>
  );
}

const columns: ColumnDef<RecentSignerWithLatestResponse>[] = [
  {
    id: 'slotId',
    accessorKey: 'slotId',
  },
  {
    id: 'signerManager',
    accessorFn: (signer) => signer.signerManagers[0] ?? '',
  },
  {
    id: 'weightPercent',
    accessorKey: 'weightPercent',
    sortDescFirst: true,
  },
  {
    id: 'health',
    accessorFn: (signer) => 1 - signer.degradation50,
    sortDescFirst: true,
  },
  {
    id: 'version',
    accessorFn: (signer) => getSortableVersion(signer.versionShort),
    sortingFn: (a, b) =>
      versionSort(
        getSortableVersion(a.original.versionShort),
        getSortableVersion(b.original.versionShort)
      ),
    sortDescFirst: true,
  },
  {
    id: 'activity',
    accessorFn: (signer) =>
      signer.createdAt ? new Date(signer.createdAt).getTime() : 0,
    sortDescFirst: true,
  },
];

export function SignersTable({
  signers,
  rewardCycle,
}: {
  signers: RecentSignerWithLatestResponse[];
  rewardCycle: number;
}) {
  const [sorting, setSorting] = React.useState<SortingState>([
    { id: 'slotId', desc: false },
  ]);
  const table = useReactTable({
    data: signers,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

  return (
    <section className="overflow-hidden border border-border bg-card">
      <div className="flex h-10 items-center justify-between border-b border-border bg-muted/20 px-3">
        <div className="flex items-baseline gap-2">
          <h2 className="font-mono text-xs font-medium">Signers</h2>
        </div>
        <span className="font-mono text-[10px] text-muted-foreground">
          reward cycle {rewardCycle}
        </span>
      </div>

      <div
        className={cn(
          gridClassName,
          'hidden h-8 items-center gap-x-3 border-b border-border bg-muted/10 px-3 md:grid'
        )}
      >
        <SortHeader column={table.getColumn('slotId')}>signer</SortHeader>
        <SortHeader column={table.getColumn('signerManager')}>
          signer manager
        </SortHeader>
        <SortHeader column={table.getColumn('weightPercent')} align="right">
          power
        </SortHeader>
        <SortHeader column={table.getColumn('health')} align="right">
          health
        </SortHeader>
        <SortHeader column={table.getColumn('version')}>version</SortHeader>
        <div />
      </div>

      <div>
        {table.getRowModel().rows.map((row) => {
          const signer = row.original;
          return (
            <div
              key={signer.publicKey}
              className={cn(
                gridClassName,
                'group items-center gap-x-3 gap-y-2 border-b border-border/70 px-3 py-2 transition-colors last:border-b-0 hover:bg-muted/25 md:min-h-10 md:py-1'
              )}
            >
              <SignerIdentity signer={signer} />
              <div className="col-span-2 min-w-0 md:col-span-1">
                <SignerManager signer={signer} />
              </div>
              <div className="col-start-2 row-start-1 md:col-start-auto md:row-start-auto">
                <SigningPower signer={signer} />
              </div>
              <div className="col-start-1 row-start-3 md:col-auto md:row-start-auto">
                <Health degradation={signer.degradation50} />
              </div>
              <div className="col-start-2 row-start-3 min-w-0 md:col-auto md:row-start-auto">
                <Version signer={signer} />
              </div>
              <div className="col-span-2 row-start-4 min-w-0 md:col-auto md:row-start-auto">
                <Activity signer={signer} />
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
