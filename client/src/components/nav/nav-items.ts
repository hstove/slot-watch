export type NavItem = {
  to:
    | '/'
    | '/blocks'
    | '/signers'
    | '/state-machines'
    | '/state-machine-history'
    | '/when-extend'
    | '/miners'
    | '/forecast'
    | '/mcp';
  label: string;
  description: string;
  /** Only mark active on an exact path match (needed for `/`). */
  exact?: boolean;
  /** Other path prefixes that belong to this section (e.g. block detail pages). */
  alsoMatches?: string[];
};

export type NavGroup = {
  label: string;
  items: NavItem[];
};

const timeline: NavItem = {
  to: '/',
  label: 'timeline',
  description: 'live proposals and signer responses',
  exact: true,
};
const blocks: NavItem = {
  to: '/blocks',
  label: 'blocks',
  description: 'recent stacks and bitcoin blocks',
  alsoMatches: ['/stx-blocks', '/btc-blocks'],
};
const signers: NavItem = {
  to: '/signers',
  label: 'signers',
  description: 'signer set, weights and activity',
};
const stateMachines: NavItem = {
  to: '/state-machines',
  label: 'state machines',
  description: "each signer's current view of the chain",
};
const stateMachineHistory: NavItem = {
  to: '/state-machine-history',
  label: 'state machine history',
  description: 'state machine updates over time',
};
const extend: NavItem = {
  to: '/when-extend',
  label: 'extend',
  description: 'when signers will allow a tenure extend',
};
const miners: NavItem = {
  to: '/miners',
  label: 'miners',
  description: 'miner stats and block commits',
};
const forecast: NavItem = {
  to: '/forecast',
  label: 'forecast',
  description: 'when a bitcoin block height will arrive',
};
const mcp: NavItem = {
  to: '/mcp',
  label: 'mcp',
  description: 'query slot watch from your ai agent',
};

/** Always-visible links in the desktop header. */
export const primaryNav: NavItem[] = [
  timeline,
  blocks,
  signers,
  miners,
  forecast,
];

/** Desktop "consensus" dropdown. */
export const consensusNav: NavItem[] = [
  stateMachines,
  stateMachineHistory,
  extend,
];

/** Utility link shown next to the theme toggle on desktop. */
export const utilityNav: NavItem[] = [mcp];

/** Every page, grouped the same way as the desktop header, for the mobile menu. */
export const navGroups: NavGroup[] = [
  { label: 'explore', items: primaryNav },
  { label: 'consensus', items: consensusNav },
  { label: 'tools', items: utilityNav },
];

const TRAILING_SLASHES = /\/+$/;

const matchesPrefix = (path: string, prefix: string) =>
  path === prefix || path.startsWith(`${prefix}/`);

export const isNavItemActive = (item: NavItem, pathname: string) => {
  const path = pathname.replace(TRAILING_SLASHES, '') || '/';
  if (item.exact) return path === item.to;
  return [item.to, ...(item.alsoMatches ?? [])].some((prefix) =>
    matchesPrefix(path, prefix)
  );
};
