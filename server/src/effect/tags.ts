import { Context } from 'effect';
import type { Effect } from 'effect';
import type { ApiBlockProposal, WSPayload } from 'slot-watch-common';
import type { InferInsertModel } from 'drizzle-orm';
import type { Db as DbType } from '../db/db';
import type {
  blockProposals,
  blockPushes,
  blockResponses,
  stateMachineUpdates,
} from '../db/schema';

export type DbBlockProposal = InferInsertModel<typeof blockProposals>;
export type DbBlockPush = InferInsertModel<typeof blockPushes>;
export type DbBlockResponse = InferInsertModel<typeof blockResponses>;
export type DbStateMachineUpdate = InferInsertModel<typeof stateMachineUpdates>;

export interface DbService {
  insertBlockProposal(input: DbBlockProposal): Effect.Effect<void, DbError>;
  insertBlockPush(input: DbBlockPush): Effect.Effect<void, DbError>;
  insertBlockResponses(input: DbBlockResponse[]): Effect.Effect<void, DbError>;
  insertStateMachineUpdate(
    input: DbStateMachineUpdate
  ): Effect.Effect<void, DbError>;
  fetchBlockProposalsByHash(
    hashes: string[]
  ): Effect.Effect<ApiBlockProposal[], DbError>;
  withDb<R>(f: (db: DbType) => Promise<R>): Effect.Effect<R, DbError>;
}

export const DbServiceTag = Context.GenericTag<DbService>('DbService');

export interface StreamerService {
  publish(payload: WSPayload): Effect.Effect<void, StreamerError>;
}

export const StreamerServiceTag =
  Context.GenericTag<StreamerService>('StreamerService');

// Export service accessors for convenience
export const Db = DbServiceTag;
export const Streamer = StreamerServiceTag;
// Error types
export class DbError {
  readonly _tag = 'DbError';
  // biome-ignore lint/style/noParameterProperties: ignored using `--suppress`
  constructor(readonly cause: unknown) {}
}

export class StreamerError {
  readonly _tag = 'StreamerError';
  // biome-ignore lint/style/noParameterProperties: ignored using `--suppress`
  constructor(readonly cause: unknown) {}
}
