import React from 'react';
import { createLink } from '@tanstack/react-router';
import { cn } from '@/lib/utils';
import { textVariants } from '@/lib/text-variants';

interface RouterLinkProps
  extends React.AnchorHTMLAttributes<HTMLAnchorElement> {}

const LinkComponent = React.forwardRef<
  HTMLAnchorElement,
  RouterLinkProps
>((props, ref) => {
  // const href = useAddNetworkParam(props.href);
  return <a ref={ref} {...props} href={props.href} />;
});

const Link = createLink(LinkComponent);

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
