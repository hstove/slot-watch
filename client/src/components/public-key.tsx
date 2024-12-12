import { useToast } from '@/hooks/use-toast';
import { useCopyToClipboard } from 'usehooks-ts';
import { textVariants } from '@/lib/text-variants';
import { cn } from '@/lib/utils';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

export const PublicKey = ({ publicKey }: { publicKey: string }) => {
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
              'max-w-[90px] text-nowrap text-ellipsis inline-block overflow-clip text-xs',
            )}
          >
            {publicKey}
          </code>
        </TooltipTrigger>
        <TooltipContent>
          <p>{publicKey}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
};
