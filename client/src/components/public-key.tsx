import { useToast } from '@/hooks/use-toast';
import { useCopyToClipboard } from 'usehooks-ts';
import { textVariants } from '@/lib/text-variants';
import { cn, truncateMiddle } from '@/lib/utils';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

export const PublicKey = ({
  publicKey,
  head = 6,
  tail = 5,
  className,
}: {
  publicKey: string;
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
            copy(publicKey);
            toast({
              title: 'Copied to clipboard',
            });
          }}
        >
          <code
            className={cn(
              textVariants({ variant: 'code' }),
              'text-nowrap inline-block text-xs',
              className
            )}
          >
            {truncateMiddle(publicKey, head, tail)}
          </code>
        </TooltipTrigger>
        <TooltipContent>
          <p>{publicKey}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
};
