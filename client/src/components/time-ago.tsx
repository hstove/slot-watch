import { useMemo } from "react";
import { formatDistanceToNow } from "date-fns";
import { cn } from "@/lib/utils";
import React from "react";

export interface TimeAgoProps extends React.HTMLAttributes<HTMLSpanElement> {
  date: string;
}

export const TimeAgo = React.forwardRef<HTMLSpanElement, TimeAgoProps>(
  ({ date, className }, ref) => {
    const timeAgo = useMemo(() => {
      return formatDistanceToNow(new Date(date), { addSuffix: true });
    }, [date]);
    return (
      <span ref={ref} className={cn(className)}>
        {timeAgo}
      </span>
    );
  }
);
