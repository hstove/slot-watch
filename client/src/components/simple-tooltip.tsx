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
  tooltipProps = {},
  tooltipProviderProps = {},
}: {
  children: React.ReactNode;
  content: React.ReactNode;
  triggerProps?: React.ComponentPropsWithoutRef<typeof TooltipTrigger>;
  tooltipProps?: React.ComponentPropsWithoutRef<typeof Tooltip>;
  tooltipProviderProps?: Omit<
    React.ComponentPropsWithoutRef<typeof TooltipProvider>,
    'children'
  >;
}) => {
  return (
    <TooltipProvider delayDuration={100} {...tooltipProviderProps}>
      <Tooltip {...tooltipProps}>
        <TooltipTrigger {...triggerProps} asChild>
          {children}
        </TooltipTrigger>
        <TooltipContent>{content}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
};
