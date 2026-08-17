import { useSyncExternalStore } from 'react';
import {
  getEntity,
  getKnownEntity,
  subscribeLocalSigners,
} from '@/lib/local-signers';

export const useEntity = (publicKey: string) => {
  return useSyncExternalStore(
    subscribeLocalSigners,
    () => getEntity(publicKey),
    () => getKnownEntity(publicKey)
  );
};
