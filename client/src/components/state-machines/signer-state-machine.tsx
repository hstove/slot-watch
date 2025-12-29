import React from 'react';
import { useAtomValue } from 'jotai';
import { signerStateMachineFamily } from '@/store/state-machine-store';

export function SignerStateMachine({
  signerPublicKey,
}: {
  signerPublicKey: string;
}) {
  const signerStateMachine = useAtomValue(
    signerStateMachineFamily(signerPublicKey)
  );
}
