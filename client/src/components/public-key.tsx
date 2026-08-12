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
  className,
}: {
  publicKey: string;
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
            {truncateMiddle(publicKey, 6, 5)}
          </code>
        </TooltipTrigger>
        <TooltipContent>
          <p>{publicKey}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
};
