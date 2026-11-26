import { Router } from 'express';
import { validate } from '../../middleware/validate.js';
import { loginBody, registerBody, sessionIdParams } from './auth.schemas.js';

export function createAuthRouter({ controller, requireAuth, credentialLimiter, refreshLimiter }) {
  const router = Router();

  router.get('/csrf', controller.csrfToken);
  router.post(
    '/register',
    credentialLimiter,
    validate({ body: registerBody }),
    controller.register,
  );
  router.post('/login', credentialLimiter, validate({ body: loginBody }), controller.login);
  router.post('/refresh', refreshLimiter, controller.refresh);
  router.post('/logout', controller.logout);
  router.get('/me', requireAuth, controller.me);
  router.get('/sessions', requireAuth, controller.listSessions);
  router.post('/sessions/revoke-others', requireAuth, controller.revokeOtherSessions);
  router.delete(
    '/sessions/:sessionId',
    requireAuth,
    validate({ params: sessionIdParams }),
    controller.revokeSession,
  );

  return router;
}
