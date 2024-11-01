import { networkIdAtom } from '@/store/network';
import { useAtomValue } from 'jotai';
import React from 'react';
import {
  Link as RouterLink,
  type To,
  type LinkProps as RouterLinkProps,
  type NavLinkProps as RouterNavLinkProps,
  NavLink as RouterNavLink,
} from 'react-router-dom';

// export type LinkProps = OmitRouterLinkProps;

function useAddNetworkParam(to: To) {
  const network = useAtomValue(networkIdAtom);
  if (typeof to === 'string') {
    return {
      pathname: to,
      search: `network=${network}`,
    };
  }
  const params = new URLSearchParams(to.search);
  params.set('network', network);
  return {
    ...to,
    search: params.toString(),
  };
}

export const Link = React.forwardRef<HTMLAnchorElement, RouterLinkProps>(
  (props, ref) => {
    const to = useAddNetworkParam(props.to);
    return <RouterLink ref={ref} {...props} to={to} />;
  },
);

export const NavLink = React.forwardRef<HTMLAnchorElement, RouterNavLinkProps>(
  (props, ref) => {
    const to = useAddNetworkParam(props.to);
    return <RouterNavLink ref={ref} {...props} to={to} />;
  },
);
