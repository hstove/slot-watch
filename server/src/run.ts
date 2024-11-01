import { hex } from '@scure/base';
import { db } from './db/db';
import { getPayloadContractId } from './utils';
import type { StackerDBPayload } from 'slot-watch-common';
import {
  blockProposals,
  blockPushes,
  blockResponses,
  stackerDbSlots,
} from './db/schema';
import { eq, desc, not, inArray } from 'drizzle-orm';
import { burnAddress } from './constants';
import { getNetworkKey } from './auth';
import type { ChunkEvent } from 'slot-watch-common';
import { handleStackerDBChunk } from './events/stackerdb';

function makeContractIdQuery(contractIdQuery: string | null) {
  if (typeof contractIdQuery === 'string') {
    let contractId = contractIdQuery;
    if (!contractIdQuery.includes('.')) {
      contractId = `${burnAddress}.${contractIdQuery}`;
    }
    return eq(stackerDbSlots.contractId, contractId);
  }
  return undefined;
}

const CHUNKS_EVENT = 'chunks';
const BURN_BLOCKS_EVENT = 'burn_blocks';

const server = Bun.serve({
  port: 1080,
  async fetch(req) {
    const url = new URL(req.url);
    const networkKey = getNetworkKey(req);
    if (url.pathname === '/stackerdb_chunks') {
      if (networkKey === null) {
        return new Response('Unauthorized', { status: 200 });
      }
      const data = (await req.json()) as StackerDBPayload;
      const contractId = getPayloadContractId(data);
      console.log(
        `${networkKey}: Got ${data.modified_slots.length} updates for ${contractId}`,
      );
      const receivedAt = new Date();
      for (const chunk of data.modified_slots) {
        const sharedPayload = {
          slotId: chunk.slot_id,
          version: chunk.slot_version,
          contractId,
          networkKey,
        };
        server.publish(
          CHUNKS_EVENT,
          JSON.stringify({
            ...sharedPayload,
            signature: chunk.sig,
            data: chunk.data,
            createdAt: receivedAt.toISOString(),
          } satisfies ChunkEvent),
        );
      }
      process.nextTick(async () => {
        try {
          await handleStackerDBChunk(data, receivedAt, networkKey);
        } catch (error) {
          console.error(`Error handling stacker db chunk: ${error}`);
        }
      });
      return new Response('OK', { status: 200 });
    }

    console.log(`${url.pathname} with network key ${networkKey ?? 'none'}`);

    if (url.pathname === '/new_burn_block') {
      const data = await req.json();
      // server.publish(BURN_BLOCKS_EVENT, JSON.stringify(data));
    }

    if (url.pathname === '/get_chunks') {
      const contractIdQuery = url.searchParams.get('contractId');
      console.log(`Getting chunks for ${contractIdQuery}`);
      const chunks = await db
        .select()
        .from(stackerDbSlots)
        .where(makeContractIdQuery(contractIdQuery))
        .orderBy(desc(stackerDbSlots.createdAt))
        .limit(100);
      const chunksResponse = chunks.map((chunk) => {
        return {
          ...chunk,
          slotId: chunk.slotId,
          receivedAt: chunk.createdAt,
          version: chunk.version,
          data: hex.encode(chunk.data),
          signature: hex.encode(chunk.signature),
        };
      });
      return new Response(JSON.stringify(chunksResponse), {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
        },
      });
    }

    if (url.pathname === '/get_block') {
      const blockId = url.searchParams.get('blockId');
      if (blockId === null) {
        return new Response('Missing blockId', { status: 400 });
      }

      const [blockPushed] = await db
        .select()
        .from(blockPushes)
        .where(eq(blockPushes.signerSignatureHash, blockId))
        .limit(1);
      const [proposal] = await db
        .select()
        .from(blockProposals)
        .where(eq(blockProposals.signerSignatureHash, blockId))
        .limit(1);
      const responses = await db
        .select()
        .from(blockResponses)
        .where(eq(blockResponses.signerSignatureHash, blockId));
      const response = {
        proposal,
        responses,
        blockPushed,
      };
      return new Response(JSON.stringify(response), {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
        },
      });
    }

    if (url.pathname === '/get_blocks') {
      const limit = 10;
      const blockHeights = await db
        .select({
          chainLength: blockProposals.chainLength,
          signerSignatureHash: blockProposals.signerSignatureHash,
        })
        .from(blockProposals)
        .limit(limit);
      const pushedHeights = await db
        .select({
          chainLength: blockPushes.chainLength,
          signerSignatureHash: blockPushes.signerSignatureHash,
        })
        .from(blockPushes)
        .where(
          not(
            inArray(
              blockPushes.chainLength,
              blockHeights.map((b) => b.chainLength),
            ),
          ),
        )
        .limit(limit);
      // combine to get unique list of sorted heights
      const combined = [...blockHeights, ...pushedHeights];
      const heights = combined
        .slice()
        .sort((a, b) => b.chainLength - a.chainLength)
        .map((h) => h.chainLength);
      const responses = await db
        .select()
        .from(blockResponses)
        .where(
          inArray(
            blockResponses.signerSignatureHash,
            combined.map((b) => b.signerSignatureHash),
          ),
        );
      // return new Response(JSON.stringify(proposed), {
      // 	status: 200,
      // 	headers: {
      // 		"Content-Type": "application/json",
      // 	},
      // });
    }

    if (url.pathname === '/watch') {
      if (server.upgrade(req)) {
        return; // do not return a Response
      }
      return new Response('Upgrade failed', { status: 500 });
    }

    return new Response('Hello World');
  },
  websocket: {
    async open(ws) {
      ws.subscribe(CHUNKS_EVENT);
      ws.subscribe(BURN_BLOCKS_EVENT);
    },
    async message(ws, message) {},
    async close(ws, code, reason) {
      ws.unsubscribe(CHUNKS_EVENT);
      ws.unsubscribe(BURN_BLOCKS_EVENT);
    },
  },
});

console.log(`Server is running on ${server.url}`);
