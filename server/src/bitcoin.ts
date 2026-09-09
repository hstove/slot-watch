import { getAddressFromPublicKey } from '@stacks/transactions';
import { stacksExplorerNetworkKey } from 'slot-watch-common';

/** Esplora-compatible APIs, tried in order; the first is team-hosted. */
const ESPLORA_HOSTS = [
  'https://leather.mempool.space/api',
  'https://mempool.space/api',
  'https://blockstream.info/api',
];

const COMPRESSED_PUBKEY = /^0[23][0-9a-f]{64}$/;

interface EsploraVin {
  scriptsig_asm?: string;
  witness?: string[];
  prevout?: { scriptpubkey_type?: string };
}

/**
 * Compressed public key that signed the transaction's first input, for the
 * single-key script types Stacks miners use (p2pkh, p2wpkh). Null otherwise.
 */
export function inputPublicKey(vin: EsploraVin | undefined): string | null {
  if (!vin) return null;
  const type = vin.prevout?.scriptpubkey_type;
  let key: string | undefined;
  if (type === 'p2pkh') {
    key = vin.scriptsig_asm?.split(' ').at(-1);
  } else if (type === 'v0_p2wpkh') {
    key = vin.witness?.[1];
  }
  return key && COMPRESSED_PUBKEY.test(key) ? key : null;
}

/**
 * Fetch the public key that funded a Bitcoin transaction. Returns null if
 * every API fails or the input type isn't single-key, so callers can store
 * the row and resolve the miner later.
 */
export async function fetchTxSenderPublicKey(
  txid: string,
  fetchImpl: typeof fetch = fetch
): Promise<string | null> {
  for (const host of ESPLORA_HOSTS) {
    try {
      const res = await fetchImpl(`${host}/tx/${txid}`, {
        signal: AbortSignal.timeout(5000),
      });
      if (!res.ok) continue;
      const tx = (await res.json()) as { vin?: EsploraVin[] };
      return inputPublicKey(tx.vin?.[0]);
    } catch {
      // try next host
    }
  }
  return null;
}

/** STX address for a miner's public key; equals `miner_rewards.miner_address`. */
export function minerAddressFromPublicKey(
  publicKey: string,
  networkKey: string
): string {
  return getAddressFromPublicKey(
    publicKey,
    stacksExplorerNetworkKey(networkKey)
  );
}
