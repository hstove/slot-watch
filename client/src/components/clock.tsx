import { cn } from '@/lib/utils';
import React from 'react';
import { useInterval } from 'usehooks-ts';

export interface ClockProps extends React.HTMLAttributes<HTMLDivElement> {}

export const Clock = ({ className }: ClockProps) => {
  const [ts, setTs] = React.useState(new Date().toLocaleTimeString());
  useInterval(() => {
    setTs(new Date().toLocaleTimeString());
  }, 250);

  return <span className={cn(className, 'font-mono text-sm')}>{ts}</span>;
};
