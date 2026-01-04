import type { BlockListResponse } from '@stacks/stacks-blockchain-api-types';
import * as P from 'micro-packed';
import {
  decodeChunkMaybe,
  SignerMessageTypePrefix,
  TypeIdCoder,
} from 'slot-watch-common';
import { makeDb } from '../src/db/db';
import { and, eq, sql } from 'drizzle-orm';
import { stackerDbSlots } from '../src/db/schema';
import { hex } from '@scure/base';
import {
  addressToString,
  addressFromPublicKeys,
  AddressVersion,
  AddressHashMode,
  createStacksPublicKey,
} from '@stacks/transactions';

const blocks: BlockListResponse['results'] = [];

const db = makeDb();

async function getBlocks(offset: number) {
  const url = `https://api.hiro.so/extended/v2/blocks?limit=30&offset=${offset}`;
  const response = await fetch(url);
  const data = (await response.json()) as BlockListResponse;
  return data.results;
}

blocks.push(
  ...(
    await Promise.all([
      getBlocks(0),
      getBlocks(30),
      getBlocks(60),
      getBlocks(90),
      getBlocks(120),
      getBlocks(150),
    ])
  ).flat()
);

console.log('Fetched blocks');

const MockProposalStartCoder = P.struct({
  typeId: TypeIdCoder(SignerMessageTypePrefix.MockProposal),
  burnBlockHeight: P.U64BE,
});

const chunkQueries = blocks.map((block) => {
  const encoded = MockProposalStartCoder.encode({
    typeId: SignerMessageTypePrefix.MockProposal,
    burnBlockHeight: BigInt(block.burn_block_height),
  });
  return hex.encode(encoded);
});

const mocks = await db
  .select()
  .from(stackerDbSlots)
  .where(
    and(
      eq(stackerDbSlots.networkKey, 'mainnet'),
      sql.raw(`encode(data, 'hex') similar to '(${chunkQueries.join('|')})%'`)
    )
  );

console.log(mocks.length);

const upgradedMiners = new Set<string>();
const missingBlocks = new Set<number>();

for (const block of blocks) {
  const found = mocks.find((m) => {
    const chunk = decodeChunkMaybe(m.data);
    if (!chunk || chunk.typeId !== SignerMessageTypePrefix.MockProposal)
      return false;
    if ('eventBurnHeight' in chunk) return false;
    return chunk.burnBlockHeight === BigInt(block.burn_block_height);
  });
  if (found) {
    upgradedMiners.add(found.publicKey ?? '');
  } else {
    missingBlocks.add(block.burn_block_height);
  }
}

for (const miner of upgradedMiners) {
  const addr = addressFromPublicKeys(
    AddressVersion.MainnetSingleSig,
    AddressHashMode.P2PKH,
    1,
    [createStacksPublicKey(miner)]
  );
  const _btcAddr = addressFromPublicKeys(
    1 as AddressVersion,
    AddressHashMode.P2PKH,
    1,
    [createStacksPublicKey(miner)]
  );
  console.log(addressToString(addr), miner);
}

for (const block of missingBlocks) {
  console.log(block);
}

console.log(`Found ${missingBlocks.size} missing out of ${blocks.length}`);

process.exit(0);
