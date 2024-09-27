import { drizzle } from "drizzle-orm/node-postgres";
import { Client } from "pg";

const dbUrl =
	process.env.DATABASE_URL ||
	"postgresql://hankstoever@localhost:5432/slot_watch_dev";

const client = new Client({
	// connectionString: "postgres://user:password@host:port/db",
	connectionString: dbUrl,
});

// or
// const client = new Client({
// 	host: "127.0.0.1",
// 	port: 5432,
// 	user: "postgres",
// 	password: "password",
// 	database: "db_name",
// });

await client.connect();
console.log("Connected to DB");

export const db = drizzle(client);
