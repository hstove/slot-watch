import { cva } from 'class-variance-authority';
import { cn } from '@/lib/utils';
import type { VariantProps } from 'class-variance-authority';

export const statusVariants = cva('', {
  variants: {
    status: {
      success: 'bg-green-700',
      warning: 'bg-orange-700',
      error: 'bg-red-700',
      pending: 'bg-slate-500',
    },
  },
});

export type StatusVariants = VariantProps<typeof statusVariants>;

export const statusStyles = (
  status: StatusVariants['status'],
  className?: string,
) => {
  return cn(statusVariants({ status, className }));
};
