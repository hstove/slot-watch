// import { Client } from "pg";
import pg from 'pg';
import postgres from 'postgres';
import dotenv from 'dotenv';
dotenv.config();
const { Client } = pg;

const dbUrl =
  process.env.DATABASE_URL ||
  'postgresql://hankstoever@localhost:5432/slot_watch';

console.log('DB URL', dbUrl);

// const client = new Client({
// 	// connectionString: "postgres://user:password@host:port/db",
// 	connectionString: dbUrl,
// });

const client = new Client({
  connectionTimeoutMillis: 10000,
  connectionString: dbUrl,
});

const sql = postgres(dbUrl, {
  ssl: false,
});

// try {
// 	await client.connect();
// 	console.log("Connected to DB");
// } catch (error) {
// 	console.error(`Error connecting to DB: ${error}`);
// 	// console.error(error.stack);
// 	process.exit(1);
// }

await sql`select * from stacker_db_slots limit 1;`;
