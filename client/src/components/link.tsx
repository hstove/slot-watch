import { networkIdAtom } from '@/store/network';
import { useAtomValue } from 'jotai';
import React from 'react';
import {
  Link as RouterLink,
  type To,
  type LinkProps as RouterLinkProps,
} from 'react-router-dom';

// export type LinkProps = OmitRouterLinkProps;

export const Link = React.forwardRef<HTMLAnchorElement, RouterLinkProps>(
  (props, ref) => {
    const network = useAtomValue(networkIdAtom);
    let to: To;
    if (typeof props.to === 'string') {
      to = {
        pathname: props.to,
        search: `network=${network}`,
      };
    } else {
      const params = new URLSearchParams(props.to.search);
      params.set('network', network);
      to = {
        ...props.to,
        search: params.toString(),
      };
    }
    return <RouterLink ref={ref} {...props} to={to} />;
  },
);
