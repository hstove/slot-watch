import { Link } from '@tanstack/react-router';
import { useCopyToClipboard } from 'usehooks-ts';
import { useToast } from '@/hooks/use-toast';
import { cn, truncateMiddle } from '@/lib/utils';
import type { MinerRow } from '@/lib/miner-rows';
import type { MinerWindow } from '@/lib/miner-economics';
import { SimpleTooltip } from '../simple-tooltip';

export function CopyValue({
  value,
  head,
  tail,
  className,
  wrap = false,
}: {
  value: string;
  head: number;
  tail: number;
  className?: string;
  /** Wrap long values instead of truncating them. */
  wrap?: boolean;
}) {
  const { toast } = useToast();
  const [, copy] = useCopyToClipboard();
  return (
    <SimpleTooltip content={value}>
      <button
        type="button"
        className={cn(
          'block min-w-0 max-w-full text-left font-mono text-[10px] leading-3 text-muted-foreground transition-colors hover:text-foreground',
          wrap ? 'break-all' : 'truncate',
          className
        )}
        onClick={(event) => {
          event.stopPropagation();
          copy(value);
          toast({ title: 'Copied to clipboard' });
        }}
      >
        {truncateMiddle(value, head, tail)}
      </button>
    </SimpleTooltip>
  );
}

export function MinerSwatch({
  color,
  className,
}: {
  color: string;
  className?: string;
}) {
  return (
    <span
      className={cn('inline-block h-2 w-2 shrink-0', className)}
      style={{ backgroundColor: color }}
    />
  );
}

export function MinerIdentity({
  miner,
  networkKey,
  windowKey,
}: {
  miner: MinerRow;
  networkKey: string;
  windowKey: MinerWindow;
}) {
  const label = miner.address
    ? truncateMiddle(miner.address, 8, 6)
    : 'unresolved sender';
  return (
    <div className="flex min-w-0 items-center gap-2.5">
      <span
        className="h-6 w-1 shrink-0"
        style={{ backgroundColor: miner.color }}
      />
      <div className="min-w-0">
        {miner.publicKey ? (
          <Link
            to="/miners/$publicKey"
            params={{ publicKey: miner.publicKey }}
            search={{ network: networkKey, window: windowKey }}
            className="block truncate font-mono text-xs leading-4 hover:underline"
            onClick={(event) => event.stopPropagation()}
          >
            {label}
          </Link>
        ) : (
          <div className="truncate font-mono text-xs leading-4 text-muted-foreground">
            {label}
          </div>
        )}
        {miner.publicKey ? (
          <CopyValue value={miner.publicKey} head={8} tail={6} />
        ) : (
          <span className="font-mono text-[10px] leading-3 text-muted-foreground/60">
            no public key
          </span>
        )}
      </div>
    </div>
  );
}
