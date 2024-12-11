import { useCallback, useState } from 'react';
import { formatDistanceToNow } from 'date-fns';
import { cn } from '@/lib/utils';
import React from 'react';
import { SimpleTooltip } from '@/components/simple-tooltip';
import { useCopyToClipboard, useInterval } from 'usehooks-ts';
import { useToast } from '@/hooks/use-toast';

export interface TimeAgoProps extends React.HTMLAttributes<HTMLSpanElement> {
  date: string;
}

export const TimeAgo = React.forwardRef<HTMLSpanElement, TimeAgoProps>(
  ({ date, className }, ref) => {
    const [_, copy] = useCopyToClipboard();
    const { toast } = useToast();
    const [timeAgo, setTimeAgo] = useState(
      formatDistanceToNow(new Date(date), {
        addSuffix: true,
        includeSeconds: true,
      }),
    );

    const updateTimeAgo = useCallback(() => {
      setTimeAgo(formatDistanceToNow(new Date(date), { addSuffix: true }));
    }, [date]);
    useInterval(updateTimeAgo, 10000);

    const handleClick = useCallback(() => {
      copy(Date.parse(date).toString());
      toast({
        title: 'Copied to clipboard',
      });
    }, [copy, date, toast]);
    return (
      <SimpleTooltip
        content={new Date(date).toLocaleString()}
        triggerProps={{
          onClick: handleClick,
        }}
      >
        <span ref={ref} className={cn(className)}>
          {timeAgo}
        </span>
      </SimpleTooltip>
    );
  },
);
