import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTrigger,
} from '@/components/ui/dialog';
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
        className="max-w-3xl max-h-[90vh] overflow-y-auto border-border bg-card"
        onCloseAutoFocus={(e) => e.preventDefault()}
      >
        <DialogTitle className="sr-only">block details</DialogTitle>
        <React.Suspense
          fallback={
            <div className="font-mono text-xs text-muted-foreground">
              loading...
            </div>
          }
        >
          <DialogDescription>
            <StacksBlock />
          </DialogDescription>
        </React.Suspense>
      </DialogContent>
    </Dialog>
  );
};
