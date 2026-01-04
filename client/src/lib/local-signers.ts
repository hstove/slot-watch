import { knownSigners } from 'slot-watch-common';

export function getEntity(signingKey: string) {
  const known = knownSigners[signingKey];
  if (typeof known === 'string') return known;
  const local = window.localStorage.getItem(`signer-${signingKey}`);
  return local ?? undefined;
}

function saveSigner(signingKey: string, entity: string) {
  window.localStorage.setItem(`signer-${signingKey}`, entity);
}

// biome-ignore lint/suspicious/noExplicitAny:allowed
(window as any).saveSigner = saveSigner;
