export class DecodeError {
  readonly _tag = 'DecodeError';
  // biome-ignore lint/style/noParameterProperties: ignored using `--suppress`
  constructor(readonly cause: unknown) {}
}

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

export class UnknownChunkError {
  readonly _tag = 'UnknownChunkError';
  // biome-ignore lint/style/noParameterProperties: ignored using `--suppress`
  constructor(readonly typeId: number) {}
}

export class PublicKeyRecoveryError {
  readonly _tag = 'PublicKeyRecoveryError';
  // biome-ignore lint/style/noParameterProperties: ignored using `--suppress`
  constructor(readonly cause: unknown) {}
}

export type ChunkPipelineError =
  | DecodeError
  | DbError
  | StreamerError
  | UnknownChunkError
  | PublicKeyRecoveryError;
