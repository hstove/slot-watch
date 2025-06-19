// import { drizzle as drizzleBun } from 'drizzle-orm/bun-sql';
// import { SQL as BunSQL } from 'bun';
import { drizzle as drizzlePostgres } from 'drizzle-orm/postgres-js';
import { drizzle as drizzlePg } from 'drizzle-orm/node-postgres';
import postgres from 'postgres';
import { Client as NodePgClient } from 'pg';

// import { drizzle as drizzleD1 } from 'drizzle-orm/d1';

import * as schema from './schema';
import { env } from 'cloudflare:workers';

// Postgres setup

const dbUrl =
  env.DATABASE_URL ??
  // env.DB.connectionString ??
  'postgresql://hankstoever@localhost:5432/slot_watch_v2';

// let port: number | undefined;
// if (process.env.FLY_PROCESS_GROUP === 'app') {
//   port = 5433;
// }

// const sqlUrl = new URL(dbUrl);
// if (port) {
//   sqlUrl.port = port.toString();
// }

// for bun:
// const sql = new BunSQL();
// export const db = drizzleBun(sql, { schema });

// for postgres-js:
// const sql = postgres(dbUrl, {
//   prepare: false,
//   fetch_types: false,
//   max: 5,
//   // ssl: 'require',
// });
// export const db = drizzlePostgres(sql, { schema });

// export const pgClient = new NodePgClient(dbUrl);
// export const db = drizzlePg(pgClient, { schema });

export function makeDb() {
  const pgClient = new NodePgClient(dbUrl);
  return drizzlePg(pgClient, { schema });
}

export type Db = ReturnType<typeof makeDb>;

// export const db = drizzleD1(env.DB, { schema });

// Add this function to check pool status
export const getPoolStatus = () => {
  return {
    total: 0,
    idle: 0,
    waiting: 0,
  };
  // // @ts-ignore - accessing internal properties
  // const pool = sql.pool;
  // return {
  //   total: pool?.total ?? 0,
  //   idle: pool?.idle ?? 0,
  //   waiting: pool?.waiting ?? 0,
  // };
};
