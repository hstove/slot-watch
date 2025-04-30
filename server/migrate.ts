// import { migrate } from "drizzle-orm/node-postgres/migrator";
// import { migrate } from 'drizzle-orm/postgres-js/migrator';
import { migrate } from 'drizzle-orm/bun-sql/migrator';
import { db } from './src/db/db';
import { sql } from 'drizzle-orm';

console.log('Migrating...');
try {
  const curTimeout = await db.execute(sql`SHOW statement_timeout;`);
  console.log(curTimeout);
  await db.execute(sql`SET statement_timeout = '30min';`);
  await migrate(db, {
    migrationsFolder: './drizzle',
  });
} catch (error) {
  console.error(error);
  process.exit(1);
}

console.log('Done');

process.exit(0);
