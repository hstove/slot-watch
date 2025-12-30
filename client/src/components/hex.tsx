import { cn } from '@/lib/utils';

export const Hex = ({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) => {
  return (
    <div className="flex items-baseline gap-[1px]">
      <code className="font-mono select-none opacity-30 text-[0.8em]">0x</code>
      <code className={cn('font-mono', className)}>{children}</code>
    </div>
  );
};
