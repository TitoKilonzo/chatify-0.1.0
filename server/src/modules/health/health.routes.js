import { Router } from 'express';

/**
 * Health endpoint. Reports 503 when the database cannot be reached so orchestrators stop routing
 * traffic to an instance that cannot serve requests.
 */
export function createHealthRouter({ ping, logger }) {
  const router = Router();

  router.get('/', async (_req, res) => {
    const uptimeSeconds = Math.round(process.uptime());
    try {
      await ping();
      res.json({ status: 'ok', database: 'ok', uptimeSeconds });
    } catch (err) {
      logger.error({ err }, 'health check: database unreachable');
      res.status(503).json({ status: 'degraded', database: 'down', uptimeSeconds });
    }
  });

  return router;
}
