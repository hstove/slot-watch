import React from 'react';
import { createLink } from '@tanstack/react-router';
import { cn } from '@/lib/utils';
import { textVariants } from '@/lib/text-variants';

interface RouterNavLinkProps
  extends React.AnchorHTMLAttributes<HTMLAnchorElement> {}

const NavLinkComponent = React.forwardRef<
  HTMLAnchorElement,
  RouterNavLinkProps
>(({ className, ...props }, ref) => {
  return (
    <a
      ref={ref}
      {...props}
      className={cn(
        textVariants({ variant: 'small' }),
        'font-normal [&:not(.active)]:text-muted-foreground',
        className
      )}
    />
  );
});

export const NavLink = createLink(NavLinkComponent);
