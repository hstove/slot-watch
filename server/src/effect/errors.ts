export class DecodeError {
  readonly _tag = 'DecodeError';
  constructor(readonly cause: unknown) {}
}

export class DbError {
  readonly _tag = 'DbError';
  constructor(readonly cause: unknown) {}
}

export class StreamerError {
  readonly _tag = 'StreamerError';
  constructor(readonly cause: unknown) {}
}

export class UnknownChunkError {
  readonly _tag = 'UnknownChunkError';
  constructor(readonly typeId: number) {}
}

export class PublicKeyRecoveryError {
  readonly _tag = 'PublicKeyRecoveryError';
  constructor(readonly cause: unknown) {}
}

export type ChunkPipelineError = 
  | DecodeError 
  | DbError 
  | StreamerError 
  | UnknownChunkError
  | PublicKeyRecoveryError;