import { getStxCommittedForCycle, getStxCommittedToSigner } from '../src/pox-4';
import { getPoxInfo } from '../src/stacks-api';

const poxInfo = await getPoxInfo.get('mainnet');

const nextRewardCycle = poxInfo.rewardCycleId;

const stxCommitted = await getStxCommittedForCycle(BigInt(nextRewardCycle + 1));

console.log(stxCommitted);

process.exit(0);
