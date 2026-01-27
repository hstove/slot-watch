import { ModeToggle } from '@/components/theme-toggle';
import { NetworkPicker } from './network-picker';
import { NavLink } from './link';
import { BlocksIcon, MenuIcon } from 'lucide-react';
import { Button } from './ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from './ui/dropdown-menu';

const navItems = [
  { to: '/', label: 'blocks' },
  { to: '/when-extend', label: 'extend' },
  { to: '/signers', label: 'signers' },
  { to: '/miners', label: 'miners' },
  { to: '/state-machines', label: 'state machines' },
  { to: '/mcp', label: 'mcp' },
] as const;

export const Header = () => {
  return (
    <header className="flex items-center justify-between sticky top-0 z-50 bg-background py-3 px-2 md:px-0">
      <div className="flex gap-2 items-center">
        <h1 className="text-xl md:text-2xl font-bold font-mono">slot watch</h1>
        <BlocksIcon className="w-5 h-5 hidden md:block" />
      </div>
      <div className="flex gap-5 items-center">
        {/* Desktop nav */}
        <nav className="hidden md:flex gap-5 items-center">
          {navItems.map((item) => (
            <NavLink key={item.to} to={item.to}>
              {item.label}
            </NavLink>
          ))}
        </nav>

        {/* Mobile hamburger menu */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild className="md:hidden">
            <Button variant="ghost" size="icon" aria-label="menu">
              <MenuIcon className="w-5 h-5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="rounded-none">
            {navItems.map((item) => (
              <DropdownMenuItem key={item.to} asChild>
                <NavLink to={item.to} className="w-full font-mono text-sm">
                  {item.label}
                </NavLink>
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        <NetworkPicker />
        <ModeToggle />
      </div>
    </header>
  );
};
