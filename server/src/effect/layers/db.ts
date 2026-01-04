import { Context, Layer, Effect, Schema } from 'effect';
import { makeDb, type Db } from '../../db/db';
import * as schema from '../../db/schema';
import type { Db as DbType } from '../../db/db';
import { fetchBlockProposalsByHash } from '../../db/block-proposals';
import type {
  blockProposals,
  blockPushes,
  blockResponses,
  stateMachineUpdates,
} from '../../db/schema';
import type { InferInsertModel } from 'drizzle-orm';
import type { ApiBlockProposal } from 'slot-watch-common';

export type DbBlockProposal = InferInsertModel<typeof blockProposals>;
export type DbBlockPush = InferInsertModel<typeof blockPushes>;
export type DbBlockResponse = InferInsertModel<typeof blockResponses>;
export type DbStateMachineUpdate = InferInsertModel<typeof stateMachineUpdates>;

export class DbError extends Schema.TaggedError<DbError>()('@errors/DbError', {
  cause: Schema.Unknown,
  message: Schema.String,
}) {}

const withDb = <T>(fn: () => Promise<T>) =>
  Effect.gen(function* () {
    return yield* Effect.tryPromise({
      try: () => fn(),
      catch: (cause) =>
        new DbError({
          message: 'Failed to call function with database',
          cause,
        }),
    });
  });

export class DbService extends Context.Tag('@app/db')<
  DbService,
  {
    insertBlockProposal(input: DbBlockProposal): Effect.Effect<void, DbError>;
    insertBlockPush(input: DbBlockPush): Effect.Effect<void, DbError>;
    insertBlockResponses(
      input: DbBlockResponse[]
    ): Effect.Effect<void, DbError>;
    insertStateMachineUpdate(
      input: DbStateMachineUpdate
    ): Effect.Effect<void, DbError>;
    fetchBlockProposalsByHash(
      hashes: string[]
    ): Effect.Effect<ApiBlockProposal[], DbError>;
    withDb<R>(f: (db: DbType) => Promise<R>): Effect.Effect<R, DbError>;
  }
>() {}

export const DbLive = Layer.scoped(
  DbService,
  Effect.gen(function* () {
    const db = makeDb();

    yield* Effect.promise(() => db.$client.connect());

    yield* Effect.addFinalizer(() => Effect.promise(() => db.$client.end()));

    return {
      insertBlockProposal: (input) =>
        withDb(() => db.insert(schema.blockProposals).values(input)),

      insertBlockPush: (input) =>
        withDb(() => db.insert(schema.blockPushes).values(input)),

      insertBlockResponses: (input) =>
        withDb(() => db.insert(schema.blockResponses).values(input)),

      insertStateMachineUpdate: (input) =>
        withDb(() => db.insert(schema.stateMachineUpdates).values(input)),

      fetchBlockProposalsByHash: (hashes) =>
        withDb(() => fetchBlockProposalsByHash(hashes, db)),

      withDb: <R>(f: (db: Db) => Promise<R>) => withDb(() => f(db)),
    };
  })
);
