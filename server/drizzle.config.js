import { defineConfig } from 'drizzle-kit';

// Used by drizzle-kit to generate migrations from src/db/schema.js. Generation needs only the
// schema; the credentials are used by `drizzle-kit studio` and push-style commands.
export default defineConfig({
  dialect: 'turso',
  schema: './src/db/schema.js',
  out: './src/db/migrations',
  dbCredentials: {
    url: process.env.DATABASE_URL ?? 'file:./data/chatify.db',
    authToken: process.env.DATABASE_AUTH_TOKEN || undefined,
  },
});
