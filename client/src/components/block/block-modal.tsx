import React from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTrigger,
} from '@/components/ui/dialog';
import { useAtom, useAtomValue, useSetAtom } from 'jotai';
import { activeBlockHashAtom } from '@/store/blocks-store';
import { activeBlockAtom } from '@/store/blocks-store';
import { textStyles } from '@/lib/text-variants';
import { DataLabel, DataValue } from '../data-group';
import { Timestamp } from '../timestamp';
import { StacksBlock } from './stacks-block';

export const BlockModal = () => {
  const block = useAtomValue(activeBlockAtom);
  const setActiveBlockHash = useSetAtom(activeBlockHashAtom);

  return (
    <Dialog
      open={block !== null}
      onOpenChange={() => setActiveBlockHash(undefined)}
    >
      <DialogTrigger>
        <div className="hidden" />
      </DialogTrigger>
      <DialogContent className="max-w-[90vw] max-h-[90vh] overflow-y-scroll">
        <StacksBlock />
      </DialogContent>
    </Dialog>
  );
};
