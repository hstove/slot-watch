import { networkIdAtom } from '@/store/network';
import { useAtomValue } from 'jotai';
import React from 'react';
import {
  Link as RouterLink,
  // type To,
  // type LinkProps as RouterLinkProps,
  // type NavLinkProps as RouterNavLinkProps,
  // NavLink as RouterNavLink,
  createLink,
} from '@tanstack/react-router';

// export type LinkProps = OmitRouterLinkProps;

// Modify the href to always include the network param
function useAddNetworkParam(href?: string) {
  // const network = useAtomValue(networkIdAtom);
  // if (!href) return undefined;
  return href;
  // console.log('href', href);
  // const u = URL.parse(href);
  // u.searchParams.set('network', network);
  // return u.toString();
}

interface RouterLinkProps
  extends React.AnchorHTMLAttributes<HTMLAnchorElement> {}

export const LinkComponent = React.forwardRef<
  HTMLAnchorElement,
  RouterLinkProps
>((props, ref) => {
  // const href = useAddNetworkParam(props.href);
  return <a ref={ref} {...props} href={props.href} />;
});

export const Link = createLink(LinkComponent);

interface RouterNavLinkProps
  extends React.AnchorHTMLAttributes<HTMLAnchorElement> {}

// export const NavLink = React.forwardRef<HTMLAnchorElement, RouterNavLinkProps>(
//   (props, ref) => {
//     const href = useAddNetworkParam(props.href);
//     return <RouterNavLink ref={ref} href={href} {...props}/>;
//   },
// );
