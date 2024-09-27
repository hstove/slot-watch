import { defineConfig } from "drizzle-kit";

const dbUrl =
	process.env.DATABASE_URL ||
	"postgresql://hankstoever@localhost:5432/slot_watch_dev";

export default defineConfig({
	schema: "./src/schema.ts",
	out: "./drizzle",
	dialect: "postgresql", // 'postgresql' | 'mysql' | 'sqlite'
	dbCredentials: {
		url: dbUrl,
	},
});
