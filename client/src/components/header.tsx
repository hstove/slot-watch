import { ModeToggle } from '@/components/theme-toggle';
import { NetworkPicker } from './network-picker';
import { NavLink } from './link';

export const Header = () => {
  return (
    <header className="flex items-center justify-between sticky top-0 z-50 bg-background py-3 px-2 md:px-0">
      <div className="flex gap-5 items-center">
        <h1 className="text-xl md:text-2xl font-bold">Slot watch</h1>
      </div>
      <div className="flex gap-5 items-center">
        <NavLink to={'/stream'} className="hidden md:block">
          Stream
        </NavLink>
        <NavLink to={'/'}>Signers</NavLink>
        <NavLink to={'/blocks'}>Blocks</NavLink>
        <NetworkPicker />
        <ModeToggle />
      </div>
    </header>
  );
};
