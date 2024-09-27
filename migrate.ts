import { migrate } from "drizzle-orm/node-postgres/migrator";
import { db } from "./src/db";

console.log("Migrating...");
await migrate(db, {
	migrationsFolder: "./drizzle",
});

console.log("Done");

process.exit(0);
