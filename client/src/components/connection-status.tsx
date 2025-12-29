import { cn } from '@/lib/utils';
import { cva, type VariantProps } from 'class-variance-authority';
import { ReadyState } from 'react-use-websocket';
import { SimpleTooltip } from './simple-tooltip';

const connectionStatusVariants = cva(
  'text-sm text-muted-foreground h-4 w-4 rounded-full',
  {
    variants: {
      readyState: {
        [ReadyState.CONNECTING]: 'text-yellow-500 bg-yellow-500',
        [ReadyState.OPEN]: 'text-green-500 bg-green-500',
        [ReadyState.CLOSING]: 'text-red-500 bg-red-500',
        [ReadyState.CLOSED]: 'text-red-500 bg-red-500',
        [ReadyState.UNINSTANTIATED]: 'text-red-500 bg-red-500',
      },
    },
    defaultVariants: {
      readyState: ReadyState.UNINSTANTIATED,
    },
  }
);

const connectionStatus = {
  [ReadyState.CONNECTING]: 'Connecting',
  [ReadyState.OPEN]: 'Connected',
  [ReadyState.CLOSING]: 'Closing',
  [ReadyState.CLOSED]: 'Closed',
  [ReadyState.UNINSTANTIATED]: 'Uninstantiated',
} as const;

export interface ConnectionStatusProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof connectionStatusVariants> {
  readyState: ReadyState;
}

export const ConnectionStatus = ({
  readyState,
  className,
  ...props
}: ConnectionStatusProps) => {
  return (
    <SimpleTooltip content={`${connectionStatus[readyState]} to server`}>
      <div
        className={cn(connectionStatusVariants({ readyState }), className)}
        {...props}
      />
    </SimpleTooltip>
  );
};
