import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createDatabase } from '../../src/db/client.js';
import { runMigrations } from '../../src/db/migrate.js';

/**
 * Create an isolated, fully migrated database in a temporary directory.
 * Call cleanup() in afterAll to close it and delete the files.
 */
export async function createTestDatabase() {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'chatify-test-'));
  const database = await createDatabase({ DATABASE_URL: `file:${path.join(dir, 'test.db')}` });
  await runMigrations(database.db);

  return {
    ...database,
    async cleanup() {
      database.client.close();
      await rm(dir, { recursive: true, force: true });
    },
  };
}
