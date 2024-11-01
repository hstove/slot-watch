import type React from 'react';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

export const SimpleTooltip = ({
  children,
  content,
  triggerProps = {},
}: {
  children: React.ReactNode;
  content: React.ReactNode;
  triggerProps?: React.ComponentPropsWithoutRef<typeof TooltipTrigger>;
}) => {
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger {...triggerProps}>{children}</TooltipTrigger>
        <TooltipContent>{content}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
};
