import { Hono } from "hono";
import { db } from "../db";
import { eq, inArray, sql } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import {
	blockPushes,
	blockProposals,
	blockResponses,
	stackerDbSlots,
} from "../schema";
import { getBurnAddress } from "../constants";
import { getPoxInfo, getStackerSet } from "../stacks-api";
import type { RecentSignersResponse } from "slot-watch-common";
import { hex } from "@scure/base";

const getRecentsRoutes = new Hono();

getRecentsRoutes.get("/signer-recency/:networkKey/:cycleId", async (c) => {
	const networkKey = c.req.param("networkKey");
	const cycleId = Number.parseInt(c.req.param("cycleId"), 10);
	const page = cycleId % 2;
	const burnAddress = getBurnAddress(networkKey);
	const contractId = `${burnAddress}.signers-${page}-1`;

	// const [blockPushed] = await db
	// 	.select()
	// 	.from(blockPushes)
	// 	.where(eq(blockPushes.networkKey, networkKey))
	// 	.limit(1);

	// const responses = await db
	//   .select()
	//   .from(blockResponses)
	//   .groupBy(blockResponses.signerPublicKey)
	//   .where(eq(blockResponses.networkKey, networkKey))
	//   .orderBy(desc(blockResponses.createdAt))
	//   .limit(100);
});

getRecentsRoutes.get("/signer-recency/:networkKey", async (c) => {
	const networkKey = c.req.param("networkKey");
	const poxInfo = await getPoxInfo(networkKey);
	const cycle = poxInfo.reward_cycle_id;
	const signers = await getStackerSet(networkKey, cycle);
	const signerKeys = signers.map((s) => s.signing_key);

	const query = sql`
		with latest_chunks as (
			select
				max(id) as chunk_id
				, public_key
			from stacker_db_slots r
			where
				r.network_key = ${networkKey}
				and r.public_key in ${signerKeys}
			group by r.public_key
		)
		select
			sl.id
			, sl.public_key
			, sl.created_at
			, sl.data
			, sl.contract_id
		from stacker_db_slots sl
		join latest_chunks lc
			on sl.id = lc.chunk_id
		`;

	const recentChunks = await db.execute<{
		id: number;
		public_key: string;
		created_at: string;
		data: Uint8Array;
		contract_id: string;
	}>(query);

	const signersResponse: RecentSignersResponse["signers"] = signers.map(
		(signer, index) => {
			const chunk = recentChunks.find(
				(c) => c.public_key === signer.signing_key,
			);
			const common = {
				publicKey: signer.signing_key,
				slotId: index,
				weight: signer.weight,
			};
			if (!chunk) {
				return {
					...common,
					createdAt: null,
					data: null,
				};
			}
			return {
				...common,
				createdAt: new Date(chunk.created_at).toISOString(),
				data: hex.encode(chunk.data),
			};
		},
	);

	const response: RecentSignersResponse = {
		networkKey,
		rewardCycle: cycle,
		signers: signersResponse,
	};
	return c.json(response);
});

export { getRecentsRoutes };
