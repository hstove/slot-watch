// import { drizzle } from "drizzle-orm/node-postgres";
import { drizzle as drizzlePg } from 'drizzle-orm/postgres-js';
import { drizzle as drizzleBun } from 'drizzle-orm/bun-sql';
// import { Client, Pool } from "pg";
import postgres from 'postgres';
import { logger } from '../logger';
import { SQL } from 'bun';

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

const sql = new SQL(sqlUrl.toString());

// const client = new Pool({
// 	connectionString: dbUrl,
// 	// pool: {
// 	min: 0,
// 	max: 10,
// 	connectionTimeoutMillis: 8000,
// 	idle_in_transaction_session_timeout: 8000,
// 	idleTimeoutMillis: 8000,
// 	// reapIntervalMillis: 1000,
// 	statement_timeout: 100,
// 	query_timeout: 8000,
// 	// },
// 	// ssl: false,
// });

// const sql = postgres(dbUrl, {
//   connect_timeout: 10,
//   idle_timeout: 20, // Terminate idle connections after 20 seconds
//   max: 20,
//   port,
//   debug: (connection_id, query, params) => {
//     logger.debug(
//       {
//         module: 'db',
//         connection_id,
//         query: query
//           .split('\n')
//           .map((s) => s.trim())
//           .join(' '),
//         params,
//       },
//       'Postgres debug',
//     );
//   },
//   onnotice: (notice) => {
//     logger.debug(
//       {
//         module: 'db',
//         notice,
//       },
//       'Postgres Notice',
//     );
//   },
//   onparameter: (key, value) => {
//     logger.debug(
//       {
//         module: 'db',
//         key,
//         value,
//       },
//       'Postgres Parameter',
//     );
//   },
// });

// try {
// 	await client.connect();
// 	console.log("Connected to DB");
// } catch (error) {
// 	console.error(`Error connecting to DB: ${error}`);
// 	// console.error(error.stack);
// 	// process.exit(1);
// }

// export const db = drizzle(client);
// export const db = drizzlePg(sql);
export const db = drizzleBun(sql);

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
