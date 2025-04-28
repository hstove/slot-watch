// import { config } from 'dotenv-flow';
import { defineConfig } from 'drizzle-kit';

console.log(process.env.DATABASE_URL);

const dbUrl =
  process.env.DATABASE_URL ||
  'postgresql://hankstoever@localhost:5432/slot_watch';

export default defineConfig({
  schema: './src/db/schema.ts',
  out: './drizzle',
  dialect: 'postgresql', // 'postgresql' | 'mysql' | 'sqlite'
  dbCredentials: {
    url: dbUrl,
  },
});
