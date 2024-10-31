// import { drizzle } from "drizzle-orm/node-postgres";
import { drizzle as drizzlePg } from "drizzle-orm/postgres-js";
// import { Client, Pool } from "pg";
import postgres from "postgres";

const dbUrl =
	process.env.DATABASE_URL ||
	"postgresql://hankstoever@localhost:5432/slot_watch";

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

const sql = postgres(dbUrl, {});

// try {
// 	await client.connect();
// 	console.log("Connected to DB");
// } catch (error) {
// 	console.error(`Error connecting to DB: ${error}`);
// 	// console.error(error.stack);
// 	// process.exit(1);
// }

// export const db = drizzle(client);
export const db = drizzlePg(sql);
