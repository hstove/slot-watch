import type * as React from 'react';
import { ChevronLeftIcon, ChevronRightIcon } from '@radix-ui/react-icons';
import { DayPicker, getDefaultClassNames } from 'react-day-picker';
import { cn } from '@/lib/utils';

function Chevron({ orientation }: { orientation?: string }) {
  return orientation === 'left' ? (
    <ChevronLeftIcon className="h-3.5 w-3.5" />
  ) : (
    <ChevronRightIcon className="h-3.5 w-3.5" />
  );
}

/** shadcn-style calendar (react-day-picker v9), with the app's sharp edges and mono type. */
function Calendar({
  className,
  classNames,
  showOutsideDays = true,
  ...props
}: React.ComponentProps<typeof DayPicker>) {
  const defaults = getDefaultClassNames();
  return (
    <DayPicker
      showOutsideDays={showOutsideDays}
      className={cn('p-2 font-mono text-xs', className)}
      classNames={{
        root: cn('w-fit', defaults.root),
        months: cn('relative flex flex-col gap-4', defaults.months),
        month: cn('flex w-full flex-col gap-3', defaults.month),
        nav: cn(
          'absolute inset-x-0 top-0 flex w-full items-center justify-between',
          defaults.nav
        ),
        button_previous: cn(
          'inline-flex h-7 w-7 items-center justify-center border border-border text-muted-foreground hover:bg-muted/40 hover:text-foreground disabled:opacity-40',
          defaults.button_previous
        ),
        button_next: cn(
          'inline-flex h-7 w-7 items-center justify-center border border-border text-muted-foreground hover:bg-muted/40 hover:text-foreground disabled:opacity-40',
          defaults.button_next
        ),
        month_caption: cn(
          'flex h-7 items-center justify-center lowercase',
          defaults.month_caption
        ),
        caption_label: cn('text-xs font-medium', defaults.caption_label),
        weekdays: cn('flex', defaults.weekdays),
        weekday: cn(
          'w-8 text-[10px] font-normal lowercase text-muted-foreground',
          defaults.weekday
        ),
        week: cn('mt-1 flex w-full', defaults.week),
        day: cn('h-8 w-8 p-0 text-center', defaults.day),
        day_button: cn(
          'h-8 w-8 tabular-nums hover:bg-muted/40 disabled:pointer-events-none',
          defaults.day_button
        ),
        selected: cn(
          '[&>button]:bg-foreground [&>button]:text-background [&>button]:hover:bg-foreground',
          defaults.selected
        ),
        today: cn('[&>button]:underline', defaults.today),
        outside: cn('text-muted-foreground/50', defaults.outside),
        disabled: cn('text-muted-foreground/30', defaults.disabled),
        hidden: cn('invisible', defaults.hidden),
        ...classNames,
      }}
      components={{ Chevron }}
      {...props}
    />
  );
}

export { Calendar };
