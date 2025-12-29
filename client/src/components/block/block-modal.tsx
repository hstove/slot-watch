import { Dialog, DialogContent, DialogTrigger } from '@/components/ui/dialog';
import { useAtomValue, useSetAtom } from 'jotai';
import { activeBlockHashAtom } from '@/store/blocks-store';
import { activeBlockAtom } from '@/store/blocks-store';
import { StacksBlock } from './stacks-block';
import { DialogTitle } from '@radix-ui/react-dialog';
import React from 'react';

export const BlockModal = () => {
  const block = useAtomValue(activeBlockAtom);
  const setActiveBlockHash = useSetAtom(activeBlockHashAtom);

  return (
    <Dialog
      open={block !== null}
      onOpenChange={(open) => {
        if (!open) {
          setActiveBlockHash(undefined);
          // Prevent focus restoration that causes scroll jump
          setTimeout(() => {
            if (document.activeElement instanceof HTMLElement) {
              document.activeElement.blur();
            }
          }, 0);
        }
      }}
    >
      <DialogTrigger>
        <div className="hidden" />
      </DialogTrigger>
      <DialogContent
        className="max-w-[90vw] max-h-[90vh] overflow-y-scroll"
        onCloseAutoFocus={(e) => e.preventDefault()}
      >
        {/* <ScrollArea className="max-h-dvh"> */}
        <DialogTitle className="sr-only">Block details</DialogTitle>
        {/* </ScrollArea> */}
        <React.Suspense fallback={<div>Loading...</div>}>
          <StacksBlock />
        </React.Suspense>
      </DialogContent>
    </Dialog>
  );
};
