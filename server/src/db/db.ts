// import { drizzle as drizzleBun } from 'drizzle-orm/bun-sql';
// import { SQL } from 'bun';
// import { drizzle as drizzlePg } from 'drizzle-orm/postgres-js';
import { drizzle as drizzleD1 } from 'drizzle-orm/d1';
// import postgres from 'postgres';
import * as schema from './schema';
import { env } from 'cloudflare:workers';

// Postgres setup

const dbUrl =
  process.env.DATABASE_URL ||
  'postgresql://hankstoever@localhost:5432/slot_watch';

let port: number | undefined;
if (process.env.FLY_PROCESS_GROUP === 'app') {
  port = 5433;
}

const sqlUrl = new URL(dbUrl);
if (port) {
  sqlUrl.port = port.toString();
}

// for bun:
// const sql = new SQL(sqlUrl.toString());
// export const db = drizzleBun(sql, { schema });

// for postgres-js:
// const sql = postgres(sqlUrl.toString(), { prepare: false });
// export const db = drizzlePg(sql, { schema });

export const db = drizzleD1(env.DB, { schema });

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
