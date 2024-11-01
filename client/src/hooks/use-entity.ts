import { useMemo } from 'react';
import { getEntity } from '@/lib/local-signers';

export const useEntity = (publicKey: string) => {
  return useMemo(() => getEntity(publicKey), [publicKey]);
};
