import React from 'react';
import { useTimestamp } from '@/hooks/use-timestamp';
import { cn } from '@/lib/utils';

interface TimestampProps extends React.HTMLAttributes<HTMLDivElement> {
  timestamp: string;
}

export const Timestamp = ({ timestamp, className }: TimestampProps) => {
  const { timestamp: formattedTimestamp } = useTimestamp(timestamp);
  const [textColor, setTextColor] = React.useState<string>('text-foreground');
  const [hasRendered, setHasRendered] = React.useState(false);
  // biome-ignore lint/correctness/useExhaustiveDependencies: <explanation>
  React.useEffect(() => {
    if (hasRendered) {
      setTextColor('text-green-500');
      const timer = setTimeout(() => {
        setTextColor('text-foreground');
      }, 1000);
      return () => clearTimeout(timer);
    }
    setHasRendered(true);
  }, [formattedTimestamp, setTextColor, setHasRendered]);
  return (
    <span
      className={cn(className, 'transition-colors duration-500', textColor)}
    >
      {formattedTimestamp}
    </span>
  );
};
