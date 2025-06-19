import { migrate } from 'drizzle-orm/node-postgres/migrator';
// import { migrate } from 'drizzle-orm/postgres-js/migrator';
// import { migrate } from 'drizzle-orm/bun-sql/migrator';
// import { migrate } from 'drizzle-orm/d1/migrator';
import { makeDb } from './src/db/db';
import { sql } from 'drizzle-orm';

console.log('Migration starting.');
try {
  // console.log('Migrating');
  await migrate(makeDb(), {
    migrationsFolder: './drizzle',
  });
} catch (error) {
  console.error(error);
  process.exit(1);
}

console.log('Done');

process.exit(0);
