import { cn } from '@/lib/utils';
import React from 'react';
import { useInterval } from 'usehooks-ts';

export interface ClockProps extends React.HTMLAttributes<HTMLDivElement> {}

export const Clock = ({ className }: ClockProps) => {
  const [ts, setTs] = React.useState(new Date().getTime());
  useInterval(() => {
    setTs(new Date().getTime());
  }, 500);

  const timestamp = React.useMemo(() => {
    return new Date(ts).toLocaleTimeString();
  }, [ts]);
  return (
    <span className={cn(className, 'font-mono text-sm')}>{timestamp}</span>
  );
};
