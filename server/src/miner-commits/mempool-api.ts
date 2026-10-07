import { Context, Effect, Layer, Schema } from 'effect';
import {
  HttpClient,
  HttpClientRequest,
  HttpClientResponse,
} from 'effect/unstable/http';
import { env } from 'cloudflare:workers';
import { ESPLORA_HOSTS } from '../bitcoin';

/** Hosts that serve mempool.space's `/api/v1` extensions (blockstream doesn't). */
const MEMPOOL_HOSTS = ESPLORA_HOSTS.slice(0, 2);
const HIRO_API_URL = 'https://api.hiro.so';
const REQUEST_TIMEOUT = '10 seconds';

export const EsploraTx = Schema.Struct({
  txid: Schema.String,
  vin: Schema.Array(
    Schema.Struct({
      txid: Schema.String,
      vout: Schema.Number,
      prevout: Schema.NullOr(
        Schema.Struct({
          scriptpubkey_address: Schema.optionalKey(Schema.String),
          scriptpubkey_type: Schema.optionalKey(Schema.String),
          value: Schema.Number,
        })
      ),
      scriptsig_asm: Schema.optionalKey(Schema.String),
      witness: Schema.optionalKey(Schema.Array(Schema.String)),
    })
  ),
  vout: Schema.Array(
    Schema.Struct({
      scriptpubkey: Schema.String,
      scriptpubkey_address: Schema.optionalKey(Schema.String),
      value: Schema.Number,
    })
  ),
  weight: Schema.Number,
  fee: Schema.Number,
  status: Schema.Struct({
    confirmed: Schema.Boolean,
    block_height: Schema.optionalKey(Schema.Number),
  }),
});

const RbfTx = Schema.Struct({
  txid: Schema.String,
  fee: Schema.Number,
  vsize: Schema.Number,
  /** First seen by mempool.space, unix seconds. */
  time: Schema.Number,
  fullRbf: Schema.optionalKey(Schema.Boolean),
  mined: Schema.optionalKey(Schema.Boolean),
});

/** A node in mempool.space's replacement tree; `replaces` are older versions. */
export interface RbfNode {
  readonly tx: typeof RbfTx.Type;
  readonly fullRbf?: boolean;
  readonly replaces: readonly RbfNode[];
}
const RbfNode: Schema.Codec<RbfNode> = Schema.Struct({
  tx: RbfTx,
  fullRbf: Schema.optionalKey(Schema.Boolean),
  replaces: Schema.Array(Schema.suspend(() => RbfNode)),
});

const RbfResponse = Schema.Struct({ replacements: Schema.NullOr(RbfNode) });

const Sortitions = Schema.Array(
  Schema.Struct({
    burn_block_hash: Schema.String,
    burn_block_height: Schema.Number,
    was_sortition: Schema.Boolean,
    miner_pk_hash160: Schema.NullOr(Schema.String),
  })
);

export interface SortitionInfo {
  readonly hash: string;
  readonly height: number;
  readonly wasSortition: boolean;
  readonly minerPkHash160: string | null;
}

export class MempoolApiError extends Schema.TaggedError<MempoolApiError>()(
  '@errors/MempoolApiError',
  { url: Schema.String, message: Schema.String }
) {}

const strip0x = (hex: string) => (hex.startsWith('0x') ? hex.slice(2) : hex);

export class MempoolApi extends Context.Service<
  MempoolApi,
  {
    addressMempool(
      address: string
    ): Effect.Effect<readonly (typeof EsploraTx.Type)[], MempoolApiError>;
    /** mempool.space first-seen times in unix seconds; 0 when unknown. */
    transactionTimes(
      txids: readonly string[]
    ): Effect.Effect<readonly number[], MempoolApiError>;
    /** Null when the tx was never replaced or the tree has expired (~24h). */
    rbfTree(txid: string): Effect.Effect<RbfNode | null, MempoolApiError>;
    /** A tx, including replaced versions mempool.space still caches. */
    cachedTx(
      txid: string
    ): Effect.Effect<typeof EsploraTx.Type | null, MempoolApiError>;
    tx(txid: string): Effect.Effect<typeof EsploraTx.Type, MempoolApiError>;
    sortition(
      height: number
    ): Effect.Effect<SortitionInfo | null, MempoolApiError>;
  }
>()('@app/miner-commits/MempoolApi') {}

export const MempoolApiLive = Layer.effect(
  MempoolApi,
  Effect.gen(function* () {
    const client = yield* HttpClient.HttpClient;

    /**
     * GET `path` from each host in order and decode the first OK response.
     * A 404 returns null when `notFound` is set (the resource doesn't exist,
     * so another host won't have it either).
     */
    const getFirst = Effect.fnUntraced(function* <
      S extends Schema.Decoder<unknown>,
    >(
      hosts: readonly string[],
      path: string,
      schema: S,
      options: { notFound?: boolean; headers?: Record<string, string> } = {}
    ) {
      let lastError = 'no hosts';
      for (const host of hosts) {
        const url = `${host}${path}`;
        const result = yield* client
          .execute(
            HttpClientRequest.get(url).pipe(
              HttpClientRequest.setHeaders(options.headers ?? {})
            )
          )
          .pipe(
            Effect.flatMap((response) =>
              response.status === 404 && options.notFound
                ? Effect.succeed(null)
                : HttpClientResponse.filterStatusOk(response).pipe(
                    Effect.flatMap(HttpClientResponse.schemaBodyJson(schema))
                  )
            ),
            Effect.timeout(REQUEST_TIMEOUT),
            Effect.result
          );
        if (result._tag === 'Success') return result.success;
        lastError = `${url}: ${String(result.failure)}`;
      }
      return yield* new MempoolApiError({ url: path, message: lastError });
    });

    const mustExist = <A>(path: string) =>
      Effect.flatMap((value: A | null) =>
        value === null
          ? Effect.fail(
              new MempoolApiError({ url: path, message: 'not found' })
            )
          : Effect.succeed(value)
      );

    return MempoolApi.of({
      addressMempool: (address) =>
        getFirst(
          ESPLORA_HOSTS,
          `/address/${address}/txs/mempool`,
          Schema.Array(EsploraTx)
        ).pipe(mustExist(address)),

      transactionTimes: (txids) =>
        txids.length === 0
          ? Effect.succeed([])
          : getFirst(
              MEMPOOL_HOSTS,
              `/v1/transaction-times?${txids.map((t) => `txId[]=${t}`).join('&')}`,
              Schema.Array(Schema.Number)
            ).pipe(mustExist('transaction-times')),

      rbfTree: (txid) =>
        getFirst(MEMPOOL_HOSTS, `/v1/tx/${txid}/rbf`, RbfResponse, {
          notFound: true,
        }).pipe(Effect.map((body) => body?.replacements ?? null)),

      cachedTx: (txid) =>
        getFirst(MEMPOOL_HOSTS, `/v1/tx/${txid}/cached`, EsploraTx, {
          notFound: true,
        }),

      tx: (txid) =>
        getFirst(ESPLORA_HOSTS, `/tx/${txid}`, EsploraTx).pipe(mustExist(txid)),

      sortition: (height) =>
        getFirst(
          [HIRO_API_URL],
          `/v3/sortitions/burn_height/${height}`,
          Sortitions,
          {
            notFound: true,
            headers: env.HIRO_API_KEY ? { 'x-api-key': env.HIRO_API_KEY } : {},
          }
        ).pipe(
          Effect.map((rows) => {
            const row = rows?.[0];
            return row
              ? {
                  hash: strip0x(row.burn_block_hash),
                  height: row.burn_block_height,
                  wasSortition: row.was_sortition,
                  minerPkHash160: row.miner_pk_hash160
                    ? strip0x(row.miner_pk_hash160)
                    : null,
                }
              : null;
          })
        ),
    });
  })
);
