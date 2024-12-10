import type * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';

import { cn } from '@/lib/utils';

const badgeVariants = cva(
  'inline-flex items-center rounded-md border text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 text-nowrap',
  {
    variants: {
      variant: {
        default:
          'border-transparent bg-primary text-primary-foreground shadow hover:bg-primary/80',
        secondary:
          'border-transparent bg-secondary text-secondary-foreground hover:bg-secondary/80',
        destructive:
          'border-transparent bg-destructive text-destructive-foreground shadow hover:bg-destructive/80',
        outline: 'text-foreground',
      },
      theme: {
        cyan: 'bg-cyan-700 text-foreground hover:bg-cyan-700/80',
        teal: 'bg-teal-700 text-foreground hover:bg-teal-700/80',
      },
      size: {
        icon: 'px-1 py-0.5 text-[10px] h-[20px]',
        default: 'px-2.5 py-0.5',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, theme, size, ...props }: BadgeProps) {
  return (
    <div
      className={cn(badgeVariants({ variant, theme, size }), className)}
      {...props}
    />
  );
}

export { Badge, badgeVariants };
