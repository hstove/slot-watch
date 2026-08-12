import { useToast } from '@/hooks/use-toast';
import { useCopyToClipboard } from 'usehooks-ts';
import { cn, truncateMiddle } from '@/lib/utils';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

export const TruncateMiddle = ({
  value,
  head,
  tail,
  className,
}: {
  value: string;
  head?: number;
  tail?: number;
  className?: string;
}) => {
  const { toast } = useToast();
  const [_, copy] = useCopyToClipboard();
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger
          asChild
          className="cursor-pointer"
          onClick={() => {
            copy(value);
            toast({
              title: 'Copied to clipboard',
            });
          }}
        >
          <code className={cn('font-mono text-xs', className)}>
            {truncateMiddle(value, head, tail)}
          </code>
        </TooltipTrigger>
        <TooltipContent>
          <p>{value}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
};
