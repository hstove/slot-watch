import type React from "react";
import { useTimestamp } from "@/hooks/use-timestamp";
import { cn } from "@/lib/utils";

interface TimestampProps extends React.HTMLAttributes<HTMLDivElement> {
  timestamp: string;
}

export const Timestamp = ({ timestamp, className }: TimestampProps) => {
  const { timestamp: formattedTimestamp } = useTimestamp(timestamp);
  return <span className={cn(className)}>{formattedTimestamp}</span>;
};
