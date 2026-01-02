import { mainnet } from '@clarigen/boot';
import { ClarigenClient, fetchMapGet } from '@clarigen/core';
import pAll from 'p-all';
import { hex } from '@scure/base';
import { getPoxInfo } from './stacks-api';
import { memoizeCache } from './cache';
import { log } from './logger';
import { env } from 'cloudflare:workers';
import { STACKS_MAINNET } from '@stacks/network';

const network = {
  ...STACKS_MAINNET,
  url: 'https://api.hiro.so',
};

export const client = new ClarigenClient(network);
const pox4 = mainnet.pox4;

const logger = log.child().withContext({
  module: 'pox-4',
});

async function getRewardSet(rewardCycle: bigint) {
  const listLen = await client.ro(pox4.getRewardSetSize(rewardCycle));
  // biome-ignore lint/suspicious/noEvolvingTypes: ignored using `--suppress`
  const listItems = [];
  for (let i = 0; i < listLen; i++) {
    listItems.push(async () => {
      try {
        return await fetchMapGet(
          pox4.identifier,
          pox4.maps.rewardCyclePoxAddressList,
          {
            rewardCycle,
            index: BigInt(i),
          },
          {
            network,
            apiKey: env.HIRO_API_KEY,
          }
        );
      } catch (error) {
        logger.withError(error).error('Error fetching reward set item');
        throw error;
      }
    });
  }
  try {
    const addressList = (await pAll(listItems, { concurrency: 10 })).filter(
      (n) => n !== null
    );
    return addressList;
  } catch (error) {
    return [];
  }
}

export async function getStxCommittedToSigner(
  signerPublicKey: string,
  rewardCycle: bigint
) {
  const rewardSet = await getRewardSet(rewardCycle);
  let sum = 0n;
  for (const item of rewardSet) {
    if (hex.encode(item.signer) === signerPublicKey) {
      sum += BigInt(item.totalUstx);
    }
  }
  return sum;
}

export async function getStxCommittedForCycle(rewardCycle: bigint) {
  const rewardSet = await getRewardSet(rewardCycle);
  const signers: Record<string, bigint> = {};
  for (const item of rewardSet) {
    const signerKey = hex.encode(item.signer);
    if (typeof signers[signerKey] === 'bigint') {
      signers[signerKey] += BigInt(item.totalUstx);
    } else {
      signers[signerKey] = BigInt(item.totalUstx);
    }
  }
  return signers;
}

export const stxCommittedCache = memoizeCache(
  () => 'stx_committed_cache_v2',
  async () => {
    const { rewardCycleId } = await getPoxInfo.get('mainnet');
    const allCommits = await getStxCommittedForCycle(BigInt(rewardCycleId + 1));
    return allCommits;
  },
  {
    ttl: 120 * 60,
  }
);
