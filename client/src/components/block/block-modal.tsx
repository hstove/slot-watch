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
  // const scrollPositionRef = useRef<{ x: number; y: number } | null>(null);

  // // Save scroll position when dialog opens and restore it when dialog closes
  // useEffect(() => {
  //   if (block !== null) {
  //     // Dialog is opening, save current scroll position
  //     scrollPositionRef.current = {
  //       x: window.scrollX,
  //       y: window.scrollY,
  //     };
  //   } else if (scrollPositionRef.current) {
  //     // Dialog is closing, restore scroll position
  //     window.scrollTo({
  //       left: scrollPositionRef.current.x,
  //       top: scrollPositionRef.current.y,
  //     });
  //   }
  // }, [block]);

  return (
    <Dialog
      open={block !== null}
      onOpenChange={(open) => {
        if (!open) setActiveBlockHash(undefined);
      }}
    >
      <DialogTrigger>
        <div className="hidden" />
      </DialogTrigger>
      <DialogContent className="max-w-[90vw] max-h-[90vh] overflow-y-scroll">
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
