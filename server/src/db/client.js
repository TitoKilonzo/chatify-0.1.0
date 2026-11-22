import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { createClient } from '@libsql/client';
import { drizzle } from 'drizzle-orm/libsql';
import * as schema from './schema.js';

function ensureLocalDirectory(url) {
  if (!url.startsWith('file:')) {
    return;
  }
  const filePath = url.slice('file:'.length);
  if (filePath === ':memory:' || filePath === '') {
    return;
  }
  mkdirSync(path.dirname(path.resolve(filePath)), { recursive: true });
}

/**
 * Open the database. Local development uses a libSQL file; production uses Turso.
 * Returns { client, db } where client is the raw libSQL client (for shutdown and raw queries)
 * and db is the Drizzle instance bound to the schema.
 */
export async function createDatabase({ DATABASE_URL, DATABASE_AUTH_TOKEN }) {
  ensureLocalDirectory(DATABASE_URL);
  const client = createClient({ url: DATABASE_URL, authToken: DATABASE_AUTH_TOKEN });

  // SQLite leaves foreign keys off by default. Turso enforces them already; the pragma makes the
  // behaviour identical for local files.
  await client.execute('PRAGMA foreign_keys = ON');

  const db = drizzle(client, { schema });
  return { client, db };
}

/** Cheap liveness probe used by the health endpoint. */
export async function pingDatabase(client) {
  await client.execute('SELECT 1');
}
