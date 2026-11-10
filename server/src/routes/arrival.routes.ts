import { Hono } from 'hono';
import { Schema } from 'effect';
import { describeRoute, resolver, validator } from 'hono-openapi';
import { timeout } from 'hono/timeout';
import {
  ARRIVAL_MODEL_VERSION,
  type ArrivalSample,
  type ArrivalTimeSource,
  arrivalInputFromSamples,
  BurnBlockArrivalResponseSchema,
  type BurnBlockArrivalResponse,
  estimateArrival,
  MAX_HORIZON_BLOCKS,
  NetworkKeyParamSchema,
} from 'slot-watch-common';
import {
  checkHeightWindow,
  MAX_AHEAD_BLOCKS,
  MAX_BEHIND_BLOCKS,
  MAX_HEIGHTS_PARAM,
  parseHeightsParam,
} from '../arrival/assemble';
import {
  fetchTipRow,
  getArrivalSamples,
  resolveHeightTimes,
} from '../db/arrival-samples';
import { log } from '../logger';
import type { ServerType } from '../server-context';

const ParamSchema = Schema.toStandardSchemaV1(NetworkKeyParamSchema);
const QuerySchema = Schema.toStandardSchemaV1(
  Schema.Struct({ heights: Schema.optional(Schema.String) }).annotate({
    identifier: 'BurnBlockArrivalQuery',
  })
);
const ResponseSchema = Schema.toStandardSchemaV1(
  BurnBlockArrivalResponseSchema
);

type Estimate = NonNullable<BurnBlockArrivalResponse['estimates']>[number];

/**
 * Registered BEFORE `blockRoutes` in `server.ts`: `/burn-blocks/:networkKey/arrival`
 * would otherwise be captured by `/burn-blocks/:networkKey/:heightOrHash`
 * (which would answer `{ btcBlock: null }`).
 */
export const arrivalRoutes = new Hono<ServerType>()
  .use('/burn-blocks/:networkKey/arrival', timeout(5000))
  .get(
    '/burn-blocks/:networkKey/arrival',
    describeRoute({
      summary: 'Bitcoin block arrival-time inputs and estimates',
      description: `Everything needed to estimate when a future Bitcoin block arrives. \`tip\` is the newest known burn block and \`samples\` are block times (unix seconds) at the heights returned by \`requiredHeights(tip.height)\` in \`slot-watch-common\` (about 95 heights covering the last ~2,900 blocks; heights without a trustworthy time are omitted). Pass \`{ now, tip, samples }\` through \`arrivalInputFromSamples\` and \`estimateArrival\` to forecast ANY target height client-side with a live \`now\`. Times come from \`bitcoin_blocks\` header timestamps, then \`stacks_blocks\` burn block timestamps, then, only if consistent with neighbouring header times and not part of an ingest burst, the ingest time. \`?heights=H1,H2,...\` (at most ${MAX_HEIGHTS_PARAM}; from ${MAX_BEHIND_BLOCKS} blocks behind to ${MAX_AHEAD_BLOCKS} ahead of the tip) additionally returns server-computed \`estimates\` in request order: a forecast with its serialisable distribution, or the known time for heights at or below the tip. The tip and samples are cached up to 2 minutes per (tip height, tip hash); estimates always use the request's own clock.`,
      tags: ['Burn Blocks'],
      responses: {
        200: {
          description: 'Tip, samples and optional estimates',
          content: { 'application/json': { schema: resolver(ResponseSchema) } },
        },
        400: { description: 'Invalid heights' },
        404: { description: 'No burn blocks stored yet' },
      },
    }),
    validator('param', ParamSchema),
    validator('query', QuerySchema),
    async (c) => {
      const { networkKey } = c.req.valid('param');
      const { heights: rawHeights } = c.req.valid('query');
      let requested: number[] | undefined;
      if (rawHeights !== undefined) {
        const parsed = parseHeightsParam(rawHeights);
        if (!parsed.ok) {
          return c.json({ error: parsed.error }, 400);
        }
        requested = parsed.heights;
      }
      try {
        const db = c.get('db');
        const tipRow = await fetchTipRow(db, networkKey);
        if (!tipRow) {
          return c.json({ error: 'No burn blocks stored' }, 404);
        }
        if (requested) {
          for (const height of requested) {
            const problem = checkHeightWindow(height, tipRow.height);
            if (problem) {
              return c.json({ error: problem }, 400);
            }
          }
        }
        const { tip, samples } = await getArrivalSamples(
          db,
          networkKey,
          tipRow
        );
        const body: BurnBlockArrivalResponse = {
          modelVersion: ARRIVAL_MODEL_VERSION,
          generatedAt: new Date().toISOString(),
          tip,
          samples,
          ...(requested
            ? {
                estimates: await buildEstimates({
                  db,
                  networkKey,
                  requested,
                  tip,
                  samples,
                }),
              }
            : {}),
        };
        return c.json(body);
      } catch (error) {
        log
          .withError(error)
          .withMetadata({ route: c.req.path, networkKey })
          .error('Error building burn block arrival estimates');
        return c.json({ error: 'Arrival estimate failed' }, 500);
      }
    }
  );

async function buildEstimates(args: {
  db: ServerType['Variables']['db'];
  networkKey: string;
  requested: number[];
  tip: BurnBlockArrivalResponse['tip'];
  samples: ArrivalSample[];
}): Promise<Estimate[]> {
  const { db, networkKey, requested, tip, samples } = args;
  const now = Date.now() / 1000;
  const input = arrivalInputFromSamples({ now, tip, samples });
  const known = new Map<number, { time: number; source: ArrivalTimeSource }>(
    samples.map((s) => [s.height, { time: s.time, source: s.source }])
  );
  known.set(tip.height, { time: tip.time, source: tip.timeSource });
  // Mined heights outside the cached sample set: resolve them (and neighbours
  // for the burst check) with the same source rules; at most 3 extra queries.
  const missingMined = requested.filter(
    (h) => h <= tip.height && !known.has(h)
  );
  if (missingMined.length > 0) {
    const wanted = missingMined.flatMap((h) => [h - 1, h, h + 1]);
    const resolved = await resolveHeightTimes(db, networkKey, wanted, samples);
    for (const r of resolved.samples) {
      known.set(r.height, { time: r.time, source: r.source });
    }
  }
  return requested.map((height): Estimate => {
    if (height <= tip.height) {
      const hit = known.get(height);
      return {
        status: 'mined',
        modelVersion: ARRIVAL_MODEL_VERSION,
        targetHeight: height,
        time: hit?.time ?? null,
        timeSource: hit?.source ?? null,
      };
    }
    const estimate = estimateArrival(input, height);
    if (estimate.status === 'forecast') {
      return estimate;
    }
    return {
      status: 'invalid',
      modelVersion: ARRIVAL_MODEL_VERSION,
      targetHeight: height,
      reason:
        estimate.status === 'invalid'
          ? estimate.reason
          : `target is more than ${MAX_HORIZON_BLOCKS} blocks ahead`,
    };
  });
}
