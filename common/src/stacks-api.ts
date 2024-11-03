import { getApiUrl } from './networks';
import type {
  CoreNodeInfoResponse,
  CoreNodePoxResponse,
} from '@stacks/stacks-blockchain-api-types';

// import { Signer } from '@stacks/stacks-blockchain-api-types';
export type StackerSetSigner = {
  signing_key: string;
  weight: number;
  stacked_amt: string;
};

export type StackerSet = {
  stacker_set: {
    signers: StackerSetSigner[];
  };
};

export async function getStackerSet(networkKey: string, rewardCycle: number) {
  const url = `${getApiUrl(networkKey)}/v3/stacker_set/${rewardCycle}`;
  const response = await fetch(url);
  const data = (await response.json()) as StackerSet;
  return data.stacker_set.signers;
}

export async function getCoreNodeInfo(networkKey: string) {
  const url = `${getApiUrl(networkKey)}/v2/info`;
  const response = await fetch(url);
  const data = (await response.json()) as CoreNodeInfoResponse;
  return data;
}

export async function getPoxInfo(networkKey: string) {
  const url = `${getApiUrl(networkKey)}/v2/pox`;
  const response = await fetch(url);
  const data = (await response.json()) as CoreNodePoxResponse;
  return data;
}

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
  consensusHash: string,
) {
  const url = `${getApiUrl(networkKey)}/v3/sortitions/consensus/${consensusHash}`;
  const response = await fetch(url);
  const data = (await response.json()) as ConsensusBlockResponse[];
  return data[0];
}
