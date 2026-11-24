import { Router } from 'express';
import { validate } from '../../middleware/validate.js';
import { subscribeBody, unsubscribeBody } from './push.schemas.js';

export function createPushRouter({ pushService, requireAuth }) {
  const router = Router();
  router.use(requireAuth);

  // enabled is false when the server has no VAPID keys, so the client hides the toggle.
  router.get('/key', (_req, res) => {
    res.json({ enabled: pushService.enabled, publicKey: pushService.publicKey });
  });

  router.post('/subscriptions', validate({ body: subscribeBody }), async (req, res) => {
    if (!pushService.enabled) {
      res.status(503).json({
        error: { code: 'PUSH_DISABLED', message: 'Notifications are not set up on this server' },
      });
      return;
    }
    await pushService.subscribe(req.auth.userId, req.validated.body, req.get('user-agent'));
    res.status(204).end();
  });

  router.delete('/subscriptions', validate({ body: unsubscribeBody }), async (req, res) => {
    await pushService.unsubscribe(req.auth.userId, req.validated.body.endpoint);
    res.status(204).end();
  });

  return router;
}
