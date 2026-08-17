import { knownSigners } from 'slot-watch-common';

const listeners = new Set<() => void>();

function emitLocalSigners() {
  for (const listener of listeners) listener();
}

export function subscribeLocalSigners(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function isKnownSigner(signingKey: string) {
  return typeof knownSigners[signingKey] === 'string';
}

export function getKnownEntity(signingKey: string) {
  const known = knownSigners[signingKey];
  return typeof known === 'string' ? known : undefined;
}

export function getLocalEntity(signingKey: string) {
  if (typeof window === 'undefined') return undefined;
  return window.localStorage.getItem(`signer-${signingKey}`) ?? undefined;
}

export function getEntity(signingKey: string) {
  return getKnownEntity(signingKey) ?? getLocalEntity(signingKey);
}

export function saveSigner(signingKey: string, entity: string) {
  window.localStorage.setItem(`signer-${signingKey}`, entity);
  emitLocalSigners();
}

if (typeof window !== 'undefined') {
  // biome-ignore lint/suspicious/noExplicitAny:allowed
  (window as any).saveSigner = saveSigner;
}
