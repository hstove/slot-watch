import { mainnet } from '@clarigen/boot';
import { ClarigenClient, fetchMapGet } from '@clarigen/core';
import pAll from 'p-all';
import BigNumber from 'bignumber.js';
import { hex } from '@scure/base';
import { getPoxInfo } from './stacks-api';
import { stxCommittedNextCycle } from './metrics';
import { memoizeCache } from './cache';
import { logger as _logger } from './logger';

export const client = new ClarigenClient('https://api.hiro.so');
const pox4 = mainnet.pox4;

const logger = _logger.child({
  module: 'pox-4',
});

async function getRewardSet(rewardCycle: bigint) {
  const listLen = await client.ro(pox4.getRewardSetSize(rewardCycle));
  const listItems = [];
  // console.log('Fetching reward set with length', listLen);
  for (let i = 0; i < listLen; i++) {
    listItems.push(async () => {
      // console.log('Fetching reward set item', i);
      try {
        return fetchMapGet(
          pox4.identifier,
          pox4.maps.rewardCyclePoxAddressList,
          {
            rewardCycle,
            index: BigInt(i),
          },
          {
            url: client.url,
          },
        );
      } catch (error) {
        logger.error(
          {
            error,
          },
          'Error fetching reward set item',
        );
        return null;
      }
    });
  }
  return (await pAll(listItems, { concurrency: 3 })).filter((n) => n !== null);
}

export async function getStxCommittedToSigner(
  signerPublicKey: string,
  rewardCycle: bigint,
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
  () => 'stx_committed_cache',
  async () => {
    const { rewardCycleId } = await getPoxInfo.get('mainnet');
    const allCommits = await getStxCommittedForCycle(BigInt(rewardCycleId + 1));
    return allCommits;
  },
  {
    ttl: 120 * 60,
  },
);
