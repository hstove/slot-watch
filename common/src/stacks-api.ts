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
