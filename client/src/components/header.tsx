import { useState } from 'react';
import { Link, useLocation } from '@tanstack/react-router';
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

const usePathname = () => useLocation({ select: (l) => l.pathname });

const Logo = () => (
  <Link
    to="/"
    className="flex shrink-0 items-center gap-2 font-mono text-lg font-bold md:text-xl"
  >
    <BlocksIcon className="h-5 w-5" aria-hidden />
    slot watch
  </Link>
);

// Desktop links fill the header's height so the active bar sits on its bottom border.
const desktopItemClass = (active: boolean) =>
  cn(
    'relative flex items-center gap-1 px-3 font-mono text-sm transition-colors outline-none focus-visible:text-foreground focus-visible:underline',
    'after:absolute after:inset-x-3 after:-bottom-px after:h-0.5',
    active
      ? 'text-foreground after:bg-foreground'
      : 'text-muted-foreground hover:text-foreground'
  );

const DesktopLink = ({ item, active }: { item: NavItem; active: boolean }) => (
  <Link
    to={item.to}
    className={desktopItemClass(active)}
    aria-current={active ? 'page' : undefined}
  >
    {item.label}
  </Link>
);

const ConsensusMenu = ({ pathname }: { pathname: string }) => {
  const activeItem = consensusNav.find((item) =>
    isNavItemActive(item, pathname)
  );
  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger className={desktopItemClass(!!activeItem)}>
        {activeItem?.label ?? 'consensus'}
        <ChevronDownIcon className="h-3.5 w-3.5" aria-hidden />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-72 p-0 font-mono">
        {consensusNav.map((item) => {
          const active = item === activeItem;
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
              <Link to={item.to} aria-current={active ? 'page' : undefined}>
                <span
                  className={cn('text-sm', !active && 'text-muted-foreground')}
                >
                  {item.label}
                </span>
                <span className="text-xs text-muted-foreground">
                  {item.description}
                </span>
              </Link>
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

const MobileNav = ({ pathname }: { pathname: string }) => {
  const [open, setOpen] = useState(false);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="md:hidden"
          aria-label="open menu"
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
          {navGroups.map((group) => (
            <div key={group.label} className="py-2">
              <div className="px-4 pb-1 text-xs uppercase tracking-wider text-muted-foreground">
                {group.label}
              </div>
              <ul>
                {group.items.map((item) => {
                  const active = isNavItemActive(item, pathname);
                  return (
                    <li key={item.to}>
                      <Link
                        to={item.to}
                        onClick={() => setOpen(false)}
                        aria-current={active ? 'page' : undefined}
                        className={cn(
                          'flex flex-col gap-0.5 border-l-2 px-4 py-2.5 transition-colors',
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
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
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
      <div className="flex h-14 items-center gap-4 lg:gap-8">
        <Logo />

        <nav className="hidden self-stretch md:flex" aria-label="main">
          {primaryNav.map((item) => (
            <DesktopLink
              key={item.to}
              item={item}
              active={isNavItemActive(item, pathname)}
            />
          ))}
          <ConsensusMenu pathname={pathname} />
        </nav>

        <div className="ml-auto flex items-center gap-1 self-stretch">
          <div className="hidden self-stretch md:flex">
            {utilityNav.map((item) => (
              <DesktopLink
                key={item.to}
                item={item}
                active={isNavItemActive(item, pathname)}
              />
            ))}
          </div>
          <ModeToggle className="hidden md:inline-flex" />
          <MobileNav pathname={pathname} />
        </div>
      </div>
    </header>
  );
};
