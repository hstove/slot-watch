import { Layer, Effect } from 'effect';
import { makeDb } from '../../db/db';
import * as schema from '../../db/schema';
import { type DbService, DbServiceTag, DbError } from '../tags';
import { fetchBlockProposalsByHash } from '../../db/block-proposals';

export const DbLive = Layer.scoped(
  DbServiceTag,
  Effect.gen(function* () {
    const db = makeDb();

    yield* Effect.promise(() => db.$client.connect());

    const service: DbService = {
      insertBlockProposal: (input) =>
        Effect.tryPromise({
          try: () => db.insert(schema.blockProposals).values(input),
          catch: (e) => new DbError(e),
        }),

      insertBlockPush: (input) =>
        Effect.tryPromise({
          try: () => db.insert(schema.blockPushes).values(input),
          catch: (e) => new DbError(e),
        }),

      insertBlockResponses: (input) =>
        Effect.tryPromise({
          try: () => db.insert(schema.blockResponses).values(input),
          catch: (e) => new DbError(e),
        }),

      insertStateMachineUpdate: (input) =>
        Effect.tryPromise({
          try: () => db.insert(schema.stateMachineUpdates).values(input),
          catch: (e) => new DbError(e),
        }),

      fetchBlockProposalsByHash: (hashes) =>
        Effect.tryPromise({
          try: () => fetchBlockProposalsByHash(hashes, db),
          catch: (e) => new DbError(e),
        }),
    };

    yield* Effect.addFinalizer(() => Effect.promise(() => db.$client.end()));

    return service;
  }),
);
