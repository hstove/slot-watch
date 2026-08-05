import { cva } from 'class-variance-authority';
import { cn } from '@/lib/utils';
import type { VariantProps } from 'class-variance-authority';

const statusVariants = cva('', {
  variants: {
    status: {
      success:
        'bg-green-700 text-secondary-foreground/80 hover:bg-green-700/80',
      preCommitted:
        'bg-emerald-400/70 text-secondary-foreground/80 hover:bg-emerald-400/90 dark:bg-emerald-500/60 dark:hover:bg-emerald-500/80',
      warning:
        'bg-orange-700 text-secondary-foreground/80 hover:bg-orange-700/80',
      error: 'bg-red-700 text-secondary-foreground/80 hover:bg-red-700/80',
      pending:
        'bg-secondary text-secondary-foreground/80 hover:bg-secondary/80',
    },
  },
});

export type StatusVariants = VariantProps<typeof statusVariants>;

export const statusStyles = (
  status: StatusVariants['status'],
  className?: string
) => {
  return cn(statusVariants({ status, className }));
};
