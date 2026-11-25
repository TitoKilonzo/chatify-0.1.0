import http from 'node:http';
import { env } from './config/load-env.js';
import { createLogger } from './utils/logger.js';
import { createDatabase } from './db/client.js';
import { createApp } from './app.js';
import { attachRealtime } from './realtime/index.js';
import { startKeepAlive } from './utils/keep-alive.js';

const SHUTDOWN_TIMEOUT_MS = 10_000;

const logger = createLogger(env);

// Migrations are applied explicitly with `npm run db:migrate`, never implicitly at boot, so a
// rolling deploy cannot race several instances against the same schema change.
const database = await createDatabase(env);
const app = createApp({ env, logger, database });
const server = http.createServer(app);
const realtime = await attachRealtime({
  server,
  env,
  logger,
  container: app.locals.container,
});

// Uploads that were never sent in a message are removed after a day.
const CLEANUP_INTERVAL_MS = 60 * 60 * 1000;
async function cleanupOrphans() {
  try {
    await app.locals.container.uploadsService.cleanupStale();
    await app.locals.container.phoneService.cleanup();
    const removed = await app.locals.container.attachmentsService.cleanupOrphans();
    if (removed > 0) {
      logger.info({ removed }, 'removed orphaned uploads');
    }
  } catch (err) {
    logger.error({ err }, 'orphan cleanup failed');
  }
}
async function purgeExpired() {
  try {
    const removed = await app.locals.container.messagesService.expireDue();
    if (removed > 0) {
      logger.info({ removed }, 'removed expired messages');
    }
  } catch (err) {
    logger.error({ err }, 'expiry purge failed');
  }
}
const EXPIRY_INTERVAL_MS = 30_000;
const expiryTimer = setInterval(purgeExpired, EXPIRY_INTERVAL_MS);
expiryTimer.unref();

const cleanupTimer = setInterval(cleanupOrphans, CLEANUP_INTERVAL_MS);
cleanupTimer.unref();
setTimeout(cleanupOrphans, 30_000).unref();

if (env.isProduction && env.STORAGE_DRIVER === 'local') {
  logger.warn(
    'uploads are stored on local disk: on most hosts they are lost at every deploy. ' +
      'Set STORAGE_DRIVER=r2 (see README) or mount a persistent disk at UPLOAD_DIR',
  );
}
const stopKeepAlive = env.KEEP_ALIVE_URL
  ? startKeepAlive({ url: env.KEEP_ALIVE_URL, logger })
  : () => {};

let shuttingDown = false;

/**
 * Stop accepting connections, disconnect sockets, let in-flight requests finish, close the
 * database, then exit.
 */
function shutdown(reason, exitCode = 0) {
  if (shuttingDown) {
    return;
  }
  shuttingDown = true;
  logger.info({ reason }, 'shutting down');

  const forceExit = setTimeout(() => {
    logger.error('forced exit after shutdown timeout');
    process.exit(1);
  }, SHUTDOWN_TIMEOUT_MS);
  forceExit.unref();

  clearInterval(cleanupTimer);
  clearInterval(expiryTimer);
  stopKeepAlive();
  // Closing Socket.io also closes the HTTP server it is attached to.
  realtime
    .close()
    .then(() => {
      database.client.close();
      process.exit(exitCode);
    })
    .catch((err) => {
      logger.error({ err }, 'error while closing server');
      process.exit(1);
    });
  server.closeIdleConnections();
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('unhandledRejection', (err) => {
  logger.fatal({ err }, 'unhandled promise rejection');
  shutdown('unhandledRejection', 1);
});
process.on('uncaughtException', (err) => {
  logger.fatal({ err }, 'uncaught exception');
  shutdown('uncaughtException', 1);
});

server.on('error', (err) => {
  logger.fatal({ err }, 'http server error');
  process.exit(1);
});

server.listen(env.PORT, () => {
  logger.info({ port: env.PORT, nodeEnv: env.NODE_ENV }, 'server listening');
});
