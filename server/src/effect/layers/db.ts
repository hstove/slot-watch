import { Layer, Effect } from 'effect';
import { makeDb, type Db } from '../../db/db';
import * as schema from '../../db/schema';
import { type DbService, DbServiceTag, DbError } from '../tags';
import { fetchBlockProposalsByHash } from '../../db/block-proposals';

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

export const DbLive = Layer.scoped(
  DbServiceTag,
  Effect.gen(function* () {
    const db = makeDb();

    yield* Effect.promise(() => db.$client.connect());

    const service: DbService = {
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

    yield* Effect.addFinalizer(() => Effect.promise(() => db.$client.end()));

    return service;
  })
);
