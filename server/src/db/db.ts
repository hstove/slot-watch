import { drizzle as drizzleBun } from 'drizzle-orm/bun-sql';
import { SQL } from 'bun';
import { drizzle as drizzlePg } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';

const dbUrl =
  process.env.DATABASE_URL ||
  'postgresql://hankstoever@localhost:5432/slot_watch';

let port: number | undefined;
// if (process.env.FLY_PROCESS_GROUP === 'app') {
//   port = 5433;
// }

const sqlUrl = new URL(dbUrl);
if (port) {
  sqlUrl.port = port.toString();
}

// const sql = new SQL(sqlUrl.toString());
const sql = postgres(sqlUrl.toString(), { prepare: false });

// export const db = drizzle(client);
export const db = drizzlePg(sql);
// export const db = drizzleBun(sql, { schema });

// Add this function to check pool status
export const getPoolStatus = () => {
  // @ts-ignore - accessing internal properties
  const pool = sql.pool;
  return {
    total: pool?.total ?? 0,
    idle: pool?.idle ?? 0,
    waiting: pool?.waiting ?? 0,
  };
};
