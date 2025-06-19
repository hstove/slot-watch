import type { Db } from './db/db';

export interface ServerContext {
  db: Db;
}

export interface ServerType {
  Variables: ServerContext;
}
