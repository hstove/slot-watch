// import { config } from 'dotenv-flow';
import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  schema: './src/db/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    // biome-ignore lint/style/noNonNullAssertion:allowed
    url: process.env.DATABASE_URL!,
  },
  // dialect: 'sqlite', // 'postgresql' | 'mysql' | 'sqlite'
  // driver: 'd1-http',
  // dbCredentials: {
  //   // biome-ignore lint/style/noNonNullAssertion:allowed
  //   databaseId: process.env.CLOUDFLARE_D1_DATABASE_ID!,
  //   // biome-ignore lint/style/noNonNullAssertion:allowed
  //   token: process.env.CLOUDFLARE_D1_API_TOKEN!,
  //   // biome-ignore lint/style/noNonNullAssertion:allowed
  //   accountId: process.env.CLOUDFLARE_ACCOUNT_ID!,
  // },
  // dbCredentials: {
  //   conf
  // }
  // dbCredentials: {
  //   url: dbUrl,
  // },
});
