// import { migrate } from "drizzle-orm/node-postgres/migrator";
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import { db } from './src/db/db';

console.log('Migrating...');
try {
  await migrate(db, {
    migrationsFolder: './drizzle',
  });
} catch (error) {
  console.error(error);
  process.exit(1);
}

console.log('Done');

process.exit(0);
