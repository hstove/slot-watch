import React from 'react';
import { useTimestamp } from '@/hooks/use-timestamp';
import { cn } from '@/lib/utils';

interface TimestampProps extends React.HTMLAttributes<HTMLDivElement> {
  timestamp: string;
  showMillis?: boolean;
}

export const Timestamp = React.forwardRef<HTMLDivElement, TimestampProps>(
  ({ timestamp, className, showMillis = true }: TimestampProps, ref) => {
    const { timestamp: formattedTimestamp, timestampWithoutMillis } =
      useTimestamp(timestamp);
    const [textColor, setTextColor] = React.useState<string | undefined>();
    const [hasRendered, setHasRendered] = React.useState(false);
    // biome-ignore lint/correctness/useExhaustiveDependencies: <explanation>
    React.useEffect(() => {
      if (hasRendered) {
        setTextColor('text-green-500');
        const timer = setTimeout(() => {
          setTextColor(undefined);
        }, 1000);
        return () => clearTimeout(timer);
      }
      setHasRendered(true);
    }, [formattedTimestamp, setTextColor, setHasRendered]);
    return (
      <div ref={ref}>
        <span
          className={cn(className, 'md:hidden transition-colors duration-500')}
        >
          {timestampWithoutMillis}
        </span>
        <span
          className={cn(
            className,
            'transition-colors duration-500 hidden md:block',
            textColor,
          )}
        >
          {showMillis ? formattedTimestamp : timestampWithoutMillis}
        </span>
      </div>
    );
  },
);
