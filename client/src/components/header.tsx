import { ModeToggle } from '@/components/theme-toggle';
import { NetworkPicker } from './network-picker';
import { NavLink } from './link';
import { BlocksIcon } from 'lucide-react';

export const Header = () => {
  return (
    <header className="flex items-center justify-between sticky top-0 z-50 bg-background py-3 px-2 md:px-0">
      <div className="flex gap-2 items-center">
        <h1 className="text-xl md:text-2xl font-bold">Slot watch</h1>
        <BlocksIcon className="w-5 h-5 hidden md:block" />
      </div>
      <div className="flex gap-5 items-center">
        {/* <NavLink to={'/stream'} className="hidden md:block">
          Stream
        </NavLink> */}
        <NavLink to="/when-extend">extend</NavLink>
        <NavLink to={'/signers'}>signers</NavLink>
        <NavLink className="hidden md:block" to={'/miners'}>
          miners
        </NavLink>
        <NavLink className="hidden md:block" to={'/state-machines'}>
          state machines
        </NavLink>
        <NavLink to={'/'}>blocks</NavLink>
        <NetworkPicker />
        <ModeToggle />
      </div>
    </header>
  );
};
