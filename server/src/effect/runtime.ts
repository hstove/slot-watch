import { Layer } from 'effect';
import { DbLive } from './layers/db';
import { StreamerLive } from './layers/streamer';

export const ServerRuntime = Layer.mergeAll(DbLive, StreamerLive);
