import { drizzle as drizzlePg } from 'drizzle-orm/node-postgres';
import { Client as NodePgClient } from 'pg';
import * as schema from './schema';
import { env } from 'cloudflare:workers';

const dbUrl =
  env.DATABASE_URL ?? 'postgresql://hankstoever@localhost:5432/slot_watch_v2';

export function makeDb() {
  const pgClient = new NodePgClient(env.DB.connectionString ?? dbUrl);
  return drizzlePg(pgClient, { schema });
}

export type Db = ReturnType<typeof makeDb>;
