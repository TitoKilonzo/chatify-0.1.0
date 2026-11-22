import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { migrate } from 'drizzle-orm/libsql/migrator';

export const MIGRATIONS_FOLDER = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  'migrations',
);

/** Apply every pending migration from the checked-in migrations folder. */
export async function runMigrations(db) {
  await migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });
}
