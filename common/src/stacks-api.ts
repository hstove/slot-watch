import { getApiUrl } from './networks';
import type {
  CoreNodeInfoResponse,
  CoreNodePoxResponse,
} from '@stacks/stacks-blockchain-api-types';
import createRpcClient from 'openapi-fetch';
import type { paths as rpcPaths } from './stacks-rpc-types';

const HEX_PREFIX = /^0x/;

export function createStacksRpcClient(networkKey: string, apiKey: string) {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (apiKey) {
    headers['x-api-key'] = apiKey;
  }
  return createRpcClient<rpcPaths>({
    baseUrl: getApiUrl(networkKey),
    headers,
  });
}

export type StacksRpcClient = ReturnType<typeof createStacksRpcClient>;

// import { Signer } from '@stacks/stacks-blockchain-api-types';
// biome-ignore lint/style/useConsistentTypeDefinitions: ignored using `--suppress`
export type StackerSetSigner = {
  signing_key: string;
  weight: number;
  stacked_amt: string;
  signerManagers: string[];
};

// biome-ignore lint/style/useConsistentTypeDefinitions: ignored using `--suppress`
export type StackerSet = {
  stacker_set: {
    signers: Omit<StackerSetSigner, 'signerManagers'>[];
  };
};

// biome-ignore lint/style/useConsistentTypeDefinitions: API response shape
export type RegisteredStakingSigner = {
  signer: string;
  signer_key: string;
};

// biome-ignore lint/style/useConsistentTypeDefinitions: API response shape
type RegisteredStakingSignersResponse = {
  cursor: {
    next: string | null;
  };
  results: RegisteredStakingSigner[];
};

function headersForApiKey(apiKey?: string) {
  return apiKey ? { 'x-api-key': apiKey } : undefined;
}

async function readJsonResponse<T>(response: Response, url: string) {
  if (!response.ok) {
    const body = await response.text();
    throw new Error(
      `Stacks API request failed: ${response.status} ${response.statusText} for ${url}: ${body.slice(0, 200)}`
    );
  }
  return (await response.json()) as T;
}

export async function getStackerSet(
  networkKey: string,
  rewardCycle: number,
  apiKey?: string
) {
  const apiUrl = getApiUrl(networkKey);
  const stackerSetUrl = `${apiUrl}/v3/stacker_set/${rewardCycle}`;
  const [stackerSetResponse, registeredSigners] = await Promise.all([
    fetch(stackerSetUrl, { headers: headersForApiKey(apiKey) }),
    getRegisteredStakingSigners(networkKey, apiKey),
  ]);
  const data = await readJsonResponse<StackerSet>(
    stackerSetResponse,
    stackerSetUrl
  );
  const signerManagersByKey = new Map<string, string[]>();
  for (const { signer, signer_key } of registeredSigners) {
    const key = signer_key.replace(HEX_PREFIX, '');
    const managers = signerManagersByKey.get(key) ?? [];
    managers.push(signer);
    signerManagersByKey.set(key, managers);
  }
  return data.stacker_set.signers.map((signer) => ({
    ...signer,
    signerManagers: signerManagersByKey.get(signer.signing_key) ?? [],
  }));
}

export async function getRegisteredStakingSigners(
  networkKey: string,
  apiKey?: string
) {
  const signers: RegisteredStakingSigner[] = [];
  let cursor: string | null = null;

  do {
    const url = new URL(`${getApiUrl(networkKey)}/extended/v3/staking/signers`);
    url.searchParams.set('limit', '200');
    if (cursor) url.searchParams.set('cursor', cursor);

    const response = await fetch(url, {
      headers: headersForApiKey(apiKey),
    });
    const data = await readJsonResponse<RegisteredStakingSignersResponse>(
      response,
      url.toString()
    );
    signers.push(...data.results);
    cursor = data.cursor.next;
  } while (cursor);

  return signers;
}

export async function getCoreNodeInfo(networkKey: string, apiKey?: string) {
  const url = `${getApiUrl(networkKey)}/v2/info`;
  const response = await fetch(url, { headers: headersForApiKey(apiKey) });
  const data = await readJsonResponse<CoreNodeInfoResponse>(response, url);
  return data;
}

export async function getPoxInfo(networkKey: string, apiKey?: string) {
  const url = `${getApiUrl(networkKey)}/v2/pox`;
  const response = await fetch(url, { headers: headersForApiKey(apiKey) });
  const data = await readJsonResponse<CoreNodePoxResponse>(response, url);
  return data;
}

// biome-ignore lint/style/useConsistentTypeDefinitions: ignored using `--suppress`
export type ConsensusBlockResponse = {
  burn_block_hash: string;
  burn_block_height: number;
  burn_header_timestamp: number;
  was_sortition: boolean;
  sortition_id: string;
  parent_sortition_id: string;
  stacks_parent_ch: string;
  last_sortition_ch: string;
};

export async function getConsensusBlock(
  networkKey: string,
  consensusHash: string
) {
  const url = `${getApiUrl(networkKey)}/v3/sortitions/consensus/${consensusHash}`;
  const response = await fetch(url);
  const data = (await response.json()) as ConsensusBlockResponse[];
  return data[0];
}

export interface SortitionResponse {
  /** @description The burnchain header hash of the block that triggered this event */
  burn_block_hash: string;
  /** @description The burn height of the block that triggered this event */
  burn_block_height: number;
  /** @description The burn block time of the sortition (Unix timestamp) */
  burn_header_timestamp: number;
  /** @description This sortition ID of the block that triggered this event. This incorporates PoX forking information and the burn block hash to obtain an identifier that is unique across PoX forks and burnchain forks. */
  sortition_id: string;
  /** @description The parent of this burn block's Sortition ID */
  parent_sortition_id: string;
  /** @description The consensus hash of the block that triggered this event. This incorporates PoX forking information and burn op information to obtain an identifier that is unique across PoX forks and burnchain forks. */
  consensus_hash: string;
  /** @description Boolean indicating whether or not there was a successful sortition (i.e. a winning block or miner was chosen). This will also be true if this sortition corresponds to a shadow block. */
  was_sortition: boolean;
  /** @description If sortition occurred, and the miner's VRF key registration associated a nakamoto mining pubkey with their commit, this will contain the Hash160 of that mining key. */
  miner_pk_hash160?: string | null;
  /** @description If sortition occurred, this will be the consensus hash of the burn block corresponding to the winning block commit's parent block ptr. In 3.x, this is the consensus hash of the tenure that this new burn block's miner will be building off of. */
  stacks_parent_ch?: string | null;
  /** @description If sortition occurred, this will be the consensus hash of the most recent sortition before this one. */
  last_sortition_ch?: string | null;
  /** @description In Stacks 2.x, this is the winning block. In Stacks 3.x, this is the first block of the parent tenure. */
  committed_block_hash?: string | null;
  /** @description This is the VRF seed generated by this sortition */
  vrf_seed?: string | null;
}

export async function getSortitionByConsensusHash(
  client: StacksRpcClient,
  consensusHash: string
): Promise<SortitionResponse | null> {
  const { data, error, response } = await client.GET(
    '/v3/sortitions/consensus/{consensus_hash}',
    {
      params: {
        path: {
          consensus_hash: consensusHash,
        },
      },
    }
  );

  if (!data) {
    return null;
  }

  return data[0] ?? null;
}

export async function getSortitionByBurnHeaderHash(
  client: StacksRpcClient,
  burnHeaderHash: string
): Promise<SortitionResponse | null> {
  const { data, error, response } = await client.GET(
    '/v3/sortitions/burn/{burn_header_hash}',
    {
      params: {
        path: {
          burn_header_hash: burnHeaderHash,
        },
      },
    }
  );

  if (!data) {
    return null;
  }

  return data[0] ?? null;
}

export async function getSortitionByBurnBlockHeight(
  client: StacksRpcClient,
  burnBlockHeight: number
): Promise<SortitionResponse | null> {
  const { data, error, response } = await client.GET(
    '/v3/sortitions/burn_height/{height}',
    {
      params: {
        path: {
          height: burnBlockHeight,
        },
      },
    }
  );

  if (!data) {
    return null;
  }

  return data[0] ?? null;
}
