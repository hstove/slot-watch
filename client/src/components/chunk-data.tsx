import { memo, useMemo, useState } from 'react';
import {
  Dialog,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogContent,
} from '@/components/ui/dialog';
import { Button } from './ui/button';
import {
  binaryString,
  decodeChunk,
  type DecodedChunk,
} from 'slot-watch-common';
import { hex } from '@scure/base';
import { useCopyToClipboard } from 'usehooks-ts';
import { serialize } from 'superjson';

// biome-ignore lint/suspicious/noExplicitAny:allowed
function valueToString(value: any) {
  let valString = value;
  if (value instanceof Uint8Array) {
    valString = hex.encode(value);
  } else if (typeof value === 'boolean') {
    valString = value ? 'true' : 'false';
  } else if (Array.isArray(value)) {
    valString = value
      .map((v) => {
        return valueToString(v);
      })
      .join(', ');
    valString = `[${valString}]`;
  } else if (value === null) {
    valString = 'null';
  } else if (typeof value === 'bigint') {
    valString = value.toString();
  } else if (typeof value === 'object') {
    if ('length' in value && 'bytes' in value) {
      valString = binaryString(value);
    } else {
      const { json } = serialize(value);
      valString = JSON.stringify(json, null, 2);
    }
  }
  return valString;
}

export const ChunkData = memo(({ data }: { data: string }) => {
  const [_, copy] = useCopyToClipboard();
  const [open, setOpen] = useState(false);

  const rows = useMemo(() => {
    if (!open) {
      return null;
    }
    let decoded: DecodedChunk | null = null;
    try {
      decoded = decodeChunk(hex.decode(data));
    } catch (error) {
      return null;
    }
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
  }, [data, open]);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger>
        {/* <span>{data}</span> */}
        <Button asChild variant={'outline'} size={'sm'}>
          <span>Show Data</span>
        </Button>
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
