import {
  getHealthBlocks,
  type HealthBlockBlock,
  type HealthBlockSigner,
  type HealthBlocksResponse,
} from '@/lib/slots-api';
import { atom } from 'jotai';
import { atomFamily } from 'jotai/utils';
import { dequal } from 'dequal';
import { networkIdAtom } from './network';

export const blockHashesAtom = atom<string[]>([]);

export const blockPushesAtoms = atomFamily(
  (_signerSignatureHash: string) => atom<HealthBlockBlock | null>(null),
  dequal,
);

export const blockSignersAtoms = atomFamily(
  (_signerSignatureHash: string) => atom<HealthBlockSigner[]>([]),
  dequal,
);

export const fetchBlocksAtom = atom<null, [], void>(null, async (get, set) => {
  const networkKey = get(networkIdAtom);
  const { blocks } = await getHealthBlocks(networkKey);
  for (const block of blocks) {
    const { signers, ...rest } = block;
    set(blockPushesAtoms(block.signerSignatureHash), rest);
    set(blockSignersAtoms(block.signerSignatureHash), signers);
  }
  set(
    blockHashesAtom,
    blocks.map((b) => b.signerSignatureHash),
  );
});
