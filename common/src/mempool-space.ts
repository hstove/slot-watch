export const MEMPOOL_WS_URL = 'wss://mempool.space/api/v1/ws';
const MEMPOOL_API_URL = 'https://mempool.space/api';

/** Burn blocks a commit can target: it's valid when mined at `(height - 1) % 5`. */
const BURN_BLOCK_MINED_AT_MODULUS = 5;
/** OP_RETURN, OP_PUSHDATA1 80, mainnet magic `X2`, block commit op `[`. */
const COMMIT_PREFIX = '6a4c5058325b';

export interface EsploraTx {
  readonly txid: string;
  readonly vin: readonly {
    readonly txid: string;
    readonly vout: number;
    readonly prevout: {
      readonly scriptpubkey_address?: string;
      readonly scriptpubkey_type?: string;
      readonly value: number;
    } | null;
    readonly scriptsig_asm?: string;
    readonly witness?: readonly string[];
  }[];
  readonly vout: readonly {
    readonly scriptpubkey: string;
    readonly scriptpubkey_address?: string;
    readonly value: number;
  }[];
  readonly weight: number;
  readonly fee: number;
  readonly status: {
    readonly confirmed: boolean;
    readonly block_height?: number;
  };
}

export interface MempoolBlock {
  blockVSize: number;
  nTx: number;
  totalFees: number;
  medianFee: number;
  /** [min, p10, p25, p50, p75, p90, max] in sat/vB. */
  feeRange: number[];
}

export interface MempoolTipBlock {
  id: string;
  height: number;
  timestamp: number;
}

export interface AddressTransactions {
  readonly mempool: readonly EsploraTx[];
  readonly confirmed: readonly EsploraTx[];
  readonly removed: readonly EsploraTx[];
}

export interface LiveCommit {
  txid: string;
  btcAddress: string;
  /** `txid:vout` of the first input; an RBF spends the same one. */
  input: string;
  bidSats: number;
  feeSats: number;
  vsize: number;
  feeRate: number;
  /** Burn height of the parent tenure's winning commit. */
  parentHeight: number;
  parentVtx: number;
  modulus: number;
  confirmedHeight: number | null;
  seenAt: number;
}

export function parseBlockCommit(
  tx: EsploraTx,
  seenAt: number
): LiveCommit | null {
  const script = tx.vout[0]?.scriptpubkey;
  const sender = tx.vin[0]?.prevout?.scriptpubkey_address;
  if (!(script?.startsWith(COMMIT_PREFIX) && sender)) return null;
  const data = script.slice(6);
  const bidSats = tx.vout
    .slice(1)
    .filter((out) => out.scriptpubkey_address !== sender)
    .reduce((sum, out) => sum + out.value, 0);
  const vsize = tx.weight / 4;
  return {
    txid: tx.txid,
    btcAddress: sender,
    input: `${tx.vin[0]?.txid}:${tx.vin[0]?.vout}`,
    bidSats,
    feeSats: tx.fee,
    vsize,
    feeRate: tx.fee / vsize,
    parentHeight: Number.parseInt(data.slice(134, 142), 16),
    parentVtx: Number.parseInt(data.slice(142, 146), 16),
    // Low 3 bits; the high 5 are a memo.
    modulus: Number.parseInt(data.slice(158, 160), 16) % 8,
    confirmedHeight: tx.status.confirmed
      ? (tx.status.block_height ?? null)
      : null,
    seenAt,
  };
}

/** A commit built on tip `T` only counts if mined at `T + 1`. */
export function isStaleCommit(commit: LiveCommit, tipHeight: number) {
  return commit.modulus !== tipHeight % BURN_BLOCK_MINED_AT_MODULUS;
}

export type FeeStatus =
  | { kind: 'next' | 'marginal' }
  | { kind: 'later'; blocks: number }
  | { kind: 'low' };

export function feeStatus(feeRate: number, blocks: MempoolBlock[]): FeeStatus {
  const [next] = blocks;
  if (!next) return { kind: 'next' };
  // A projected block that isn't full takes everything.
  if (next.blockVSize < 900_000) return { kind: 'next' };
  const [min = 0, p10 = min] = next.feeRange;
  if (feeRate >= p10) return { kind: 'next' };
  if (feeRate >= min) return { kind: 'marginal' };
  const index = blocks.findIndex((b) => feeRate >= (b.feeRange[0] ?? 0));
  return index === -1 ? { kind: 'low' } : { kind: 'later', blocks: index + 1 };
}

export async function fetchAddressMempool(address: string) {
  const res = await fetch(`${MEMPOOL_API_URL}/address/${address}/txs/mempool`);
  if (!res.ok) throw new Error(`mempool.space ${res.status}`);
  return (await res.json()) as EsploraTx[];
}
