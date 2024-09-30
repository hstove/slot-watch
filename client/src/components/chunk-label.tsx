import {
  chunkTypeName,
  decodeChunk,
  SignerMessageTypePrefix,
} from "slot-watch-common";
import type { ChunkEvent } from "@/lib/types";
import { memo, useState } from "react";
import { hex } from "@scure/base";

function RejectedLabel({ data }: { data: string }) {
  try {
    const decoded = decodeChunk(hex.decode(data));
    if (decoded.typeId !== SignerMessageTypePrefix.BlockResponse) {
      return null;
    }
    if (decoded.accepted === true) return null;
    const { reasonCode, validationCode } = decoded;
    let str = `${reasonCode}`;
    if (typeof validationCode === "number") {
      str += ` - ${validationCode}`;
    }
    return <span className="ml-2">({str})</span>;
  } catch {
    console.error("Failed to decode chunk in RejectedLabel", data);
    return null;
  }
}

function ChunkLabelOuter({ data }: { data: string }) {
  const bytes = hex.decode(data);
  const label = chunkTypeName(bytes);
  if (bytes[0] === SignerMessageTypePrefix.BlockResponse) {
    const accepted = bytes[1] === 0;
    return (
      <>
        <span className={accepted ? "text-green-500" : "text-red-500"}>
          {label}
        </span>
        <RejectedLabel data={data} />
      </>
    );
  }
  return <span>{label}</span>;
}

export const ChunkLabel = memo(ChunkLabelOuter);
