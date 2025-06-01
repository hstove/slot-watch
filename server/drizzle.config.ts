// import { config } from 'dotenv-flow';
import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  schema: './src/db/schema.ts',
  out: './drizzle',
  dialect: 'sqlite', // 'postgresql' | 'mysql' | 'sqlite'
  driver: 'd1-http',
  // dbCredentials: {

  // }
  // dbCredentials: {
  //   conf
  // }
  // dbCredentials: {
  //   url: dbUrl,
  // },
});
