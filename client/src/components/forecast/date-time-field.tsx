import React from 'react';
import { CalendarIcon } from '@radix-ui/react-icons';
import { Calendar } from '@/components/ui/calendar';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';

const pad = (n: number) => String(n).padStart(2, '0');

/** `YYYY-MM-DDTHH:mm` (datetime-local format) -> parts, or null. */
function parseLocal(value: string) {
  const [date, time = '00:00'] = value.split('T');
  if (!date) return null;
  const d = new Date(`${date}T00:00`);
  if (Number.isNaN(d.getTime())) return null;
  return { date: d, time: time.slice(0, 5) };
}

const toLocalDate = (d: Date) =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

/**
 * A `datetime-local` input with a calendar + time popover next to it. Both
 * edit the same `YYYY-MM-DDTHH:mm` string, so typing and clicking stay in sync.
 */
export function DateTimeField({
  id,
  value,
  onChange,
  min,
  size = 'md',
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  /** Earliest selectable value, `YYYY-MM-DDTHH:mm`. */
  min?: string;
  size?: 'sm' | 'md';
}) {
  const [open, setOpen] = React.useState(false);
  const parsed = parseLocal(value);
  const minDate = min ? parseLocal(min)?.date : undefined;
  const [month, setMonth] = React.useState<Date | undefined>(parsed?.date);
  const height = size === 'sm' ? 'h-8' : 'h-9';
  const text = size === 'sm' ? 'text-xs' : 'text-sm';

  const setPart = (date: Date | undefined, time: string | undefined) => {
    const base = date ?? parsed?.date ?? minDate ?? new Date();
    onChange(`${toLocalDate(base)}T${time ?? parsed?.time ?? '12:00'}`);
  };

  return (
    <div className="flex w-full">
      <input
        id={id}
        type="datetime-local"
        value={value}
        min={min}
        onChange={(e) => onChange(e.target.value)}
        className={`${height} ${text} w-full min-w-0 border border-input bg-transparent px-3 font-mono focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring [&::-webkit-calendar-picker-indicator]:hidden`}
      />
      <Popover
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (next) setMonth(parsed?.date ?? minDate);
        }}
      >
        <PopoverTrigger
          aria-label="pick a date and time"
          className={`${height} inline-flex w-9 shrink-0 items-center justify-center border border-l-0 border-input text-muted-foreground transition-colors hover:bg-muted/30 hover:text-foreground`}
        >
          <CalendarIcon className="h-4 w-4" />
        </PopoverTrigger>
        <PopoverContent
          align="end"
          className="w-auto rounded-none p-0 font-mono shadow-none"
        >
          <Calendar
            mode="single"
            selected={parsed?.date}
            month={month}
            onMonthChange={setMonth}
            disabled={minDate ? { before: minDate } : undefined}
            onSelect={(date) => {
              if (date) setPart(date, undefined);
            }}
          />
          <div className="flex items-center gap-2 border-t border-border px-2 py-2">
            <label
              htmlFor={`${id}-time`}
              className="text-[10px] uppercase tracking-wider text-muted-foreground"
            >
              time
            </label>
            <input
              id={`${id}-time`}
              type="time"
              value={parsed?.time ?? '12:00'}
              onChange={(e) => {
                if (e.target.value) setPart(undefined, e.target.value);
              }}
              className="h-7 flex-1 border border-input bg-transparent px-2 text-xs tabular-nums focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring [&::-webkit-calendar-picker-indicator]:hidden"
            />
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="h-7 border border-border px-2 text-[10px] hover:bg-muted/30"
            >
              done
            </button>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}
