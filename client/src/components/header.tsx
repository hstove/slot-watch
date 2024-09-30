import { ModeToggle } from "@/components/theme-toggle";

export const Header = () => {
  return (
    <header className="flex items-center justify-between">
      <h1 className="text-2xl font-bold">Slot watch</h1>
      <ModeToggle />
    </header>
  );
};
