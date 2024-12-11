import {
  type NakamotoBlock,
  SignerMessageTypePrefix,
  makeSignerSignatureHash,
  decodeChunkMaybe,
} from 'slot-watch-common';
import { hex } from '@scure/base';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { useCopyToClipboard } from 'usehooks-ts';
import { useToast } from '@/hooks/use-toast';

export const BlockHash = ({ hash }: { hash: Uint8Array }) => {
  const hexString = hex.encode(hash);
  const hexCode = hexString.slice(0, 6);
  const [_, copy] = useCopyToClipboard();
  const { toast } = useToast();
  // const color = colord(hexCode).toHex();
  // return <span style={{ color: `#${hexCode}` }}>{hexString.slice(0, 8)}</span>;
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger
          onClick={() => {
            copy(hexString);
            toast({
              title: 'Copied to clipboard',
            });
          }}
        >
          <span style={{ color: `#${hexCode}` }}>{hexString.slice(0, 8)}</span>
        </TooltipTrigger>
        <TooltipContent>
          <p>{hexString}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
};

export const ChunkBlock = ({ chunkData }: { chunkData: string }) => {
  const decoded = decodeChunkMaybe(hex.decode(chunkData));

  if (!decoded) {
    return <div>Unknown chunk</div>;
  }

  if (decoded.typeId === SignerMessageTypePrefix.BlockResponse) {
    const blockHash = decoded.signerSignatureHash;

    return <BlockHash hash={blockHash} />;
  }
  if (decoded.typeId === SignerMessageTypePrefix.MockSignature) {
    return <span>{decoded.proposal.stacksHeight.toString()}</span>;
  }
  if (decoded.typeId === SignerMessageTypePrefix.MockBlock) {
    return <span>{decoded.proposal.stacksHeight.toString()}</span>;
  }
  if (decoded.typeId === SignerMessageTypePrefix.MockProposal) {
    return <span>{decoded.stacksHeight.toString()}</span>;
  }
  if (
    decoded.typeId === SignerMessageTypePrefix.BlockProposal ||
    decoded.typeId === SignerMessageTypePrefix.BlockPushed
  ) {
    const signatureHash = makeSignerSignatureHash(decoded as NakamotoBlock);
    return (
      <>
        <BlockHash hash={signatureHash} />
        <span className="ml-2">({decoded.chainLength.toString()})</span>
        <span className="ml-2">({decoded.txCount} tx)</span>
      </>
    );
  }

  return null;
};
