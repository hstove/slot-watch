import { getAddressFromPublicKey } from '@stacks/transactions';
import { stacksExplorerNetworkKey } from 'slot-watch-common';

/** Esplora-compatible APIs, tried in order; the first is team-hosted. */
export const ESPLORA_HOSTS = [
  'https://leather.mempool.space/api',
  'https://mempool.space/api',
  'https://blockstream.info/api',
];

const COMPRESSED_PUBKEY = /^0[23][0-9a-f]{64}$/;

interface EsploraVin {
  readonly scriptsig_asm?: string;
  readonly witness?: readonly string[];
  readonly prevout?: {
    readonly scriptpubkey_type?: string;
    readonly scriptpubkey_address?: string;
  } | null;
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

export interface TxSender {
  publicKey: string;
  btcAddress: string | null;
}

/**
 * Fetch the public key and address that funded a Bitcoin transaction. Returns
 * null if every API fails or the input type isn't single-key, so callers can
 * store the row and resolve the miner later.
 */
export async function fetchTxSender(
  txid: string,
  fetchImpl: typeof fetch = fetch
): Promise<TxSender | null> {
  for (const host of ESPLORA_HOSTS) {
    try {
      const res = await fetchImpl(`${host}/tx/${txid}`, {
        signal: AbortSignal.timeout(5000),
      });
      if (!res.ok) continue;
      const tx = (await res.json()) as { vin?: EsploraVin[] };
      const vin = tx.vin?.[0];
      const publicKey = inputPublicKey(vin);
      if (!publicKey) return null;
      return {
        publicKey,
        btcAddress: vin?.prevout?.scriptpubkey_address ?? null,
      };
    } catch {
      // try next host
    }
  }
  return null;
}

/** Ordered txids of a Bitcoin block, so a tx's index is its vtxindex. Null if every API fails. */
export async function fetchBlockTxids(
  blockHash: string,
  fetchImpl: typeof fetch = fetch
): Promise<string[] | null> {
  for (const host of ESPLORA_HOSTS) {
    try {
      const res = await fetchImpl(`${host}/block/${blockHash}/txids`, {
        signal: AbortSignal.timeout(5000),
      });
      if (!res.ok) continue;
      return (await res.json()) as string[];
    } catch {
      // try next host
    }
  }
  return null;
}

/** STX address for a miner's public key. For a commit key this often, but not always, equals `miner_rewards.miner_address`. */
export function minerAddressFromPublicKey(
  publicKey: string,
  networkKey: string
): string {
  return getAddressFromPublicKey(
    publicKey,
    stacksExplorerNetworkKey(networkKey)
  );
}
