import React from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

export function RenameSignerDialog({
  open,
  onOpenChange,
  publicKey,
  currentName,
  onSave,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  publicKey: string;
  currentName?: string;
  onSave: (name: string) => void;
}) {
  const [name, setName] = React.useState(currentName ?? '');

  React.useEffect(() => {
    if (open) setName(currentName ?? '');
  }, [open, currentName]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md border-border bg-card">
        <DialogTitle className="font-mono text-sm">name signer</DialogTitle>
        <DialogDescription className="font-mono text-xs">
          saved in this browser only
        </DialogDescription>
        <form
          className="grid gap-3"
          onSubmit={(event) => {
            event.preventDefault();
            const trimmed = name.trim();
            if (!trimmed) return;
            onSave(trimmed);
            onOpenChange(false);
          }}
        >
          <code className="break-all font-mono text-[10px] text-muted-foreground">
            {publicKey}
          </code>
          <Input
            className="rounded-none font-mono"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="entity name"
            autoFocus
          />
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="rounded-none font-mono"
              onClick={() => onOpenChange(false)}
            >
              cancel
            </Button>
            <Button
              type="submit"
              size="sm"
              className="rounded-none font-mono"
              disabled={!name.trim()}
            >
              save
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
