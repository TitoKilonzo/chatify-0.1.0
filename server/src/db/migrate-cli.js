import { env } from '../config/load-env.js';
import { createLogger } from '../utils/logger.js';
import { createDatabase } from './client.js';
import { runMigrations } from './migrate.js';

const logger = createLogger(env);

try {
  const { client, db } = await createDatabase(env);
  await runMigrations(db);
  client.close();
  logger.info('migrations applied');
} catch (err) {
  logger.fatal({ err }, 'migration failed');
  process.exit(1);
}
