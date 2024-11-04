import { Hono } from 'hono';
import { db } from '../db/db';
import { eq, inArray, sql } from 'drizzle-orm';
import { index, PgDialect } from 'drizzle-orm/pg-core';
import {
  blockPushes,
  blockProposals,
  blockResponses,
  stackerDbSlots,
} from '../db/schema';
import { getBurnAddress } from '../constants';
import { getPoxInfo, getStackerSet } from '../stacks-api';
import {
  getVersionFromString,
  knownSigners,
  percentString,
  versionFromData,
  type RecentSignersResponse,
} from 'slot-watch-common';
import { hex } from '@scure/base';
import { signerDegradationRate } from '../metrics';

const getRecentsRoutes = new Hono()
  .get('/signer-recency/:networkKey', async (c) => {
    const networkKey = c.req.param('networkKey');
    const poxInfo = await getPoxInfo.get(networkKey);
    const cycle = poxInfo.rewardCycleId;
    const { signers, totalWeight } = await getStackerSet(networkKey, cycle);
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

    const signerDegradations = (await signerDegradationRate.get()).values;

    const signerDegradationMap = new Map<string, number>();

    for (const m of signerDegradations) {
      const signerKey = m.labels.signer_key;
      const lastNBlocks = m.labels.last_n_blocks;
      if (
        signerKey &&
        lastNBlocks &&
        typeof lastNBlocks === 'number' &&
        typeof signerKey === 'string'
      ) {
        signerDegradationMap.set(`${signerKey}-${lastNBlocks}`, m.value);
      }
    }

    const signersResponse: RecentSignersResponse['signers'] = signers.map(
      (signer, index) => {
        const chunk = recentChunks.find(
          (c) => c.public_key === signer.signing_key,
        );
        const percent = signer.weight / totalWeight;
        const data = chunk ? hex.encode(chunk.data) : null;
        const version = versionFromData(data);
        const versionShort = getVersionFromString(version);

        const degradation10 =
          signerDegradationMap.get(`${signer.signing_key}-10`) ?? 0;
        const degradation25 =
          signerDegradationMap.get(`${signer.signing_key}-25`) ?? 0;
        const degradation50 =
          signerDegradationMap.get(`${signer.signing_key}-50`) ?? 0;

        const common = {
          publicKey: signer.signing_key,
          name: knownSigners[signer.signing_key] ?? null,
          slotId: index,
          weight: signer.weight,
          weightPercent: percent,
          weightPercentStr: percentString(percent),
          version,
          versionShort,
          data,
          degradation10,
          degradation25,
          degradation50,
        };
        if (!chunk) {
          return {
            ...common,
            createdAt: null,
          };
        }
        return {
          ...common,
          createdAt: new Date(chunk.created_at).toISOString(),
        };
      },
    );

    const response: RecentSignersResponse = {
      networkKey,
      rewardCycle: cycle,
      totalWeight,
      signers: signersResponse,
    };
    return c.json(response);
  })
  .get('/signers/:networkKey', async (c) => {
    const networkKey = c.req.param('networkKey');
    const poxInfo = await getPoxInfo.get(networkKey);
    const cycle = poxInfo.rewardCycleId;
    const { signers, totalWeight } = await getStackerSet(networkKey, cycle);

    const signersResponse = signers.map((s, i) => {
      const percent = s.weight / totalWeight;
      const percentStr = percentString(percent);
      let label = '';
      const name = knownSigners[s.signing_key];
      if (name === null) {
        label += `#${i}`;
      } else {
        label += name;
      }
      label += ` (${percentStr}%)`;
      return {
        publicKey: s.signing_key,
        weight: s.weight,
        weightPercent: percent,
        weightPercentStr: percentStr,
        name: knownSigners[s.signing_key] ?? null,
        label,
      };
    });
    return c.json(signersResponse);
  });

export { getRecentsRoutes };
