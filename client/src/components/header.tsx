import { useEffect, useState, type ComponentProps } from 'react';
import { Link, useLocation, useRouter } from '@tanstack/react-router';
import { BlocksIcon, ChevronDownIcon, MenuIcon } from 'lucide-react';
import { ModeToggle, ThemeSwitcher } from '@/components/theme-toggle';
import { Button } from './ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from './ui/dropdown-menu';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetTitle,
  SheetTrigger,
} from './ui/sheet';
import { cn } from '@/lib/utils';
import {
  consensusNav,
  isNavItemActive,
  navGroups,
  primaryNav,
  utilityNav,
  type NavItem,
} from './nav/nav-items';

/** Matches Tailwind's `md` breakpoint, where the desktop nav takes over. */
const DESKTOP_QUERY = '(min-width: 768px)';

const usePathname = () => useLocation({ select: (l) => l.pathname });

/**
 * A router link for a nav item. TanStack adds `aria-current="page"` whenever
 * its own (fuzzy) match is active, so exact items pass `exact` through to keep
 * `/` from being "current" on every page.
 */
const NavItemLink = ({
  item,
  active,
  ...props
}: { item: NavItem; active: boolean } & Omit<
  ComponentProps<typeof Link>,
  'to'
>) => (
  <Link
    {...props}
    to={item.to}
    activeOptions={{ exact: item.exact, includeSearch: false }}
    aria-current={active ? 'page' : undefined}
  />
);

const Logo = () => (
  <h1 className="shrink-0">
    <Link
      to="/"
      activeOptions={{ exact: true, includeSearch: false }}
      className="flex items-center gap-2 whitespace-nowrap font-mono text-lg font-bold md:text-xl"
    >
      <BlocksIcon className="h-5 w-5" aria-hidden />
      slot watch
    </Link>
  </h1>
);

// Desktop links fill the header's height so the active bar sits on its bottom border.
const desktopItemClass = (active: boolean) =>
  cn(
    'relative flex items-center gap-1 whitespace-nowrap px-2 font-mono text-sm transition-colors lg:px-3',
    'outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-ring',
    'after:absolute after:inset-x-2 after:-bottom-px after:h-0.5 lg:after:inset-x-3',
    active
      ? 'text-foreground after:bg-foreground'
      : 'text-muted-foreground hover:text-foreground'
  );

const ConsensusMenu = ({ pathname }: { pathname: string }) => {
  // Controlled: a TanStack Link prevents the click's default, which stops
  // Radix from closing the menu on select, so items close it themselves.
  const [open, setOpen] = useState(false);
  const hasActiveItem = consensusNav.some((item) =>
    isNavItemActive(item, pathname)
  );

  return (
    <DropdownMenu modal={false} open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger
        className={desktopItemClass(hasActiveItem)}
        aria-current={hasActiveItem ? 'true' : undefined}
      >
        consensus
        <ChevronDownIcon className="h-3.5 w-3.5" aria-hidden />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-72 p-0 font-mono">
        {consensusNav.map((item) => {
          const active = isNavItemActive(item, pathname);
          return (
            <DropdownMenuItem
              key={item.to}
              asChild
              // Radix's Slot concatenates (not tailwind-merges) classes, so the
              // layout overrides live here rather than on the Link.
              className={cn(
                'cursor-pointer flex-col items-start gap-0.5 rounded-none border-l-2 px-3 py-2',
                active ? 'border-foreground' : 'border-transparent'
              )}
            >
              <NavItemLink
                item={item}
                active={active}
                onClick={() => setOpen(false)}
              >
                <span
                  className={cn('text-sm', !active && 'text-muted-foreground')}
                >
                  {item.label}
                </span>
                <span className="text-xs text-muted-foreground">
                  {item.description}
                </span>
              </NavItemLink>
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

const MobileNav = ({ pathname }: { pathname: string }) => {
  const [open, setOpen] = useState(false);
  const router = useRouter();

  // Close on any navigation (including back/forward) and when the viewport
  // grows into the desktop layout, which hides the trigger.
  useEffect(() => {
    const unsubscribe = router.subscribe('onBeforeNavigate', () =>
      setOpen(false)
    );
    const desktop = window.matchMedia(DESKTOP_QUERY);
    const onChange = (e: MediaQueryListEvent) => e.matches && setOpen(false);
    desktop.addEventListener('change', onChange);
    return () => {
      unsubscribe();
      desktop.removeEventListener('change', onChange);
    };
  }, [router]);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="md:hidden"
          aria-label="menu"
        >
          <MenuIcon className="h-5 w-5" />
        </Button>
      </SheetTrigger>
      <SheetContent className="font-mono">
        <div className="flex h-14 shrink-0 items-center border-b border-border px-4">
          <SheetTitle className="text-sm font-bold">slot watch</SheetTitle>
          <SheetDescription className="sr-only">
            site navigation
          </SheetDescription>
        </div>
        <nav className="flex-1 overflow-y-auto py-2" aria-label="main">
          {navGroups.map((group) => {
            const headingId = `mobile-nav-${group.label}`;
            return (
              <section
                key={group.label}
                aria-labelledby={headingId}
                className="py-2"
              >
                <h2
                  id={headingId}
                  className="px-4 pb-1 text-xs font-normal uppercase tracking-wider text-muted-foreground"
                >
                  {group.label}
                </h2>
                <ul>
                  {group.items.map((item) => {
                    const active = isNavItemActive(item, pathname);
                    return (
                      <li key={item.to}>
                        <NavItemLink
                          item={item}
                          active={active}
                          onClick={() => setOpen(false)}
                          className={cn(
                            'flex flex-col gap-0.5 border-l-2 px-4 py-2.5 outline-none transition-colors focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-ring',
                            active
                              ? 'border-foreground bg-muted/30'
                              : 'border-transparent hover:bg-muted/20'
                          )}
                        >
                          <span
                            className={cn(
                              'text-sm',
                              !active && 'text-muted-foreground'
                            )}
                          >
                            {item.label}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            {item.description}
                          </span>
                        </NavItemLink>
                      </li>
                    );
                  })}
                </ul>
              </section>
            );
          })}
        </nav>
        <div className="shrink-0 border-t border-border p-4">
          <div className="pb-2 text-xs uppercase tracking-wider text-muted-foreground">
            theme
          </div>
          <ThemeSwitcher />
        </div>
      </SheetContent>
    </Sheet>
  );
};

export const Header = () => {
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-50 border-b border-border bg-background px-2 md:px-0">
      <div className="flex h-14 items-center gap-3 lg:gap-8">
        <Logo />

        <nav className="hidden self-stretch md:flex" aria-label="main">
          {primaryNav.map((item) => {
            const active = isNavItemActive(item, pathname);
            return (
              <NavItemLink
                key={item.to}
                item={item}
                active={active}
                className={desktopItemClass(active)}
              >
                {item.label}
              </NavItemLink>
            );
          })}
          <ConsensusMenu pathname={pathname} />
        </nav>

        <div className="ml-auto flex items-center gap-1 self-stretch">
          <div className="hidden self-stretch md:flex">
            {utilityNav.map((item) => {
              const active = isNavItemActive(item, pathname);
              return (
                <NavItemLink
                  key={item.to}
                  item={item}
                  active={active}
                  className={desktopItemClass(active)}
                >
                  {item.label}
                </NavItemLink>
              );
            })}
          </div>
          <ModeToggle className="hidden md:inline-flex" />
          <MobileNav pathname={pathname} />
        </div>
      </div>
    </header>
  );
};
