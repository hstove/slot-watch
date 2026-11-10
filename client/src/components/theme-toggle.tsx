import { Monitor, Moon, Sun } from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useTheme, type Theme } from '@/components/theme-provider';
import { cn } from '@/lib/utils';

const themes = [
  { value: 'light', label: 'light', Icon: Sun },
  { value: 'dark', label: 'dark', Icon: Moon },
  { value: 'system', label: 'system', Icon: Monitor },
] as const satisfies readonly { value: Theme; label: string; Icon: unknown }[];

/** Icon button + dropdown, used in the desktop header. */
export function ModeToggle({ className }: { className?: string }) {
  const { theme, setTheme } = useTheme();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className={className}>
          <Sun className="h-[1.1rem] w-[1.1rem] rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
          <Moon className="absolute h-[1.1rem] w-[1.1rem] rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
          <span className="sr-only">toggle theme</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="font-mono">
        <DropdownMenuRadioGroup
          value={theme}
          onValueChange={(value) => setTheme(value as Theme)}
        >
          {themes.map(({ value, label, Icon }) => (
            <DropdownMenuRadioItem key={value} value={value} className="gap-2">
              <Icon className="h-3.5 w-3.5" aria-hidden />
              {label}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** Inline segmented control, used in the mobile menu. */
export function ThemeSwitcher({ className }: { className?: string }) {
  const { theme, setTheme } = useTheme();

  return (
    <fieldset
      aria-label="theme"
      className={cn('m-0 flex min-w-0 border border-border p-0', className)}
    >
      {themes.map(({ value, label }) => (
        <button
          key={value}
          type="button"
          aria-pressed={theme === value}
          onClick={() => setTheme(value)}
          className={cn(
            'flex flex-1 items-center justify-center px-2 py-2 font-mono text-xs transition-colors [&:not(:first-child)]:border-l [&:not(:first-child)]:border-border',
            theme === value
              ? 'bg-muted text-foreground'
              : 'text-muted-foreground hover:text-foreground'
          )}
        >
          {label}
        </button>
      ))}
    </fieldset>
  );
}
