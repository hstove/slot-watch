import {
  BlockPushedCoder,
  decodeChunk,
  type DecodedChunk,
  type NakamotoBlock,
  SignerMessageTypePrefix,
  makeSignerSignatureHash,
} from "slot-watch-common";
import type { ChunkEvent } from "@/lib/types";
import { hex } from "@scure/base";
import { useEffect, useState } from "react";
import { colord } from "colord";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useCopyToClipboard } from "usehooks-ts";

export const BlockHash = ({ hash }: { hash: Uint8Array }) => {
  const hexString = hex.encode(hash);
  const hexCode = hexString.slice(0, 6);
  const [_, copy] = useCopyToClipboard();
  // const color = colord(hexCode).toHex();
  // return <span style={{ color: `#${hexCode}` }}>{hexString.slice(0, 8)}</span>;
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger onClick={() => copy(hexString)}>
          <span style={{ color: `#${hexCode}` }}>{hexString.slice(0, 8)}</span>
        </TooltipTrigger>
        <TooltipContent>
          <p>{hexString}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
};

export const ChunkBlock = ({ chunk }: { chunk: ChunkEvent }) => {
  let decoded: DecodedChunk | null = null;
  try {
    decoded = decodeChunk(hex.decode(chunk.data));
  } catch (error) {
    console.error("Failed to decode chunk in ChunkBlock", chunk.data);
  }

  if (!decoded) {
    return <div>Unknown chunk</div>;
  }

  if (decoded.typeId === SignerMessageTypePrefix.BlockResponse) {
    const blockHash = decoded.signerSignatureHash;

    return <BlockHash hash={blockHash} />;
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
      </>
    );
  }

  // if (decoded.typeId === SignerMessageTypePrefix.BlockPushed) {
  // 	const signatureHash = makeSignerSignatureHash(decoded as NakamotoBlock);
  // 	return <BlockHash hash={signatureHash} />;
  // }

  return null;
};
