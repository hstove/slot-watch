import { memo, useMemo } from "react";
import {
  Dialog,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogContent,
} from "@/components/ui/dialog";
import { Button } from "./ui/button";
import {
  binaryString,
  decodeChunk,
  type DecodedChunk,
} from "slot-watch-common";
import { hex } from "@scure/base";
import { useCopyToClipboard } from "usehooks-ts";

// biome-ignore lint/suspicious/noExplicitAny: <explanation>
function valueToString(value: any) {
  let valString = value;
  if (value instanceof Uint8Array) {
    valString = hex.encode(value);
  } else if (typeof value === "boolean") {
    valString = value ? "true" : "false";
  } else if (Array.isArray(value)) {
    valString = value
      .map((v) => {
        return valueToString(v);
      })
      .join(", ");
    valString = `[${valString}]`;
  } else if (typeof value === "object") {
    if ("length" in value && "bytes" in value) {
      valString = binaryString(value);
    } else {
      valString = JSON.stringify(value, null, 2);
    }
  }
  return valString;
}

export const ChunkData = memo(({ data }: { data: string }) => {
  const [_, copy] = useCopyToClipboard();
  let decoded: DecodedChunk | null = null;
  try {
    decoded = decodeChunk(hex.decode(data));
  } catch (error) {
    return null;
  }

  const rows = useMemo(() => {
    return Object.entries(decoded).map(([key, value]) => {
      // let valString = value;
      // if (value instanceof Uint8Array) {
      //   valString = hex.encode(value);
      // } else if (typeof value === "boolean") {
      //   valString = value ? "true" : "false";
      // } else if (typeof value === "object") {
      //   if ("length" in value && "bytes" in value) {
      //     valString = binaryString(value);
      //   } else {
      //     valString = JSON.stringify(value, null, 2);
      //   }
      // } else if (Array.isArray(value)) {
      //   console.log("is array", key, value);
      //   valString = value
      //     .map((v) => {
      //       if (v instanceof Uint8Array) {
      //         return hex.encode(v);
      //       }
      //       if (
      //         typeof v === "object" &&
      //         v !== null &&
      //         "length" in v &&
      //         "bytes" in v
      //       ) {
      //         return binaryString(v);
      //       }
      //       return v;
      //     })
      //     .join(", ");
      // }
      const valString = valueToString(value);
      return (
        <div key={key}>
          <span className="font-semibold">{key}</span>
          <span className="ml-3 text-wrap break-all">{valString}</span>
        </div>
      );
    });
    // return decoded.map((row) => {
    //   return <div key={row.key}>{row.value}</div>;
    // });
  }, [decoded]);
  return (
    <Dialog>
      <DialogTrigger>
        {/* <span>{data}</span> */}
        <Button variant={"outline"}>Show Data</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Chunk Data</DialogTitle>
          <DialogDescription
            className="cursor-pointer"
            onClick={() => copy(data)}
          >
            Copy to Clipboard
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-2 max-h-[300px] overflow-y-scroll">
          {rows}
        </div>
      </DialogContent>
    </Dialog>
  );
});
