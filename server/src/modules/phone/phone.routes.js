import { Router } from 'express';
import { z } from 'zod';
import { validate } from '../../middleware/validate.js';
import { toSelfUser } from '../users/users.serializer.js';

const phoneField = z.string().trim().min(5).max(30);
const requestBody = z.object({ phone: phoneField });
const loginVerifyBody = z.object({
  phone: phoneField,
  code: z.string().regex(/^\d{6}$/, 'Enter the 6 digit code'),
  displayName: z.string().trim().min(1).max(60).optional(),
});
const linkVerifyBody = z.object({
  phone: phoneField,
  code: z.string().regex(/^\d{6}$/, 'Enter the 6 digit code'),
});

export function createPhoneRouter({
  phoneService,
  sessionCookies,
  requireAuth,
  credentialLimiter,
}) {
  const router = Router();

  router.get('/config', (_req, res) => res.json({ enabled: phoneService.enabled }));

  router.post(
    '/login/request',
    credentialLimiter,
    validate({ body: requestBody }),
    async (req, res) => {
      await phoneService.requestLoginCode(req.validated.body.phone);
      res.status(202).json({ sent: true });
    },
  );

  router.post(
    '/login/verify',
    credentialLimiter,
    validate({ body: loginVerifyBody }),
    async (req, res) => {
      const result = await phoneService.verifyLogin(req.validated.body, {
        userAgent: req.get('user-agent')?.slice(0, 255),
      });
      if (result.needsProfile) {
        res.json({ needsProfile: true });
        return;
      }
      sessionCookies.set(res, result.session);
      res.json({ user: toSelfUser(result.session.user) });
    },
  );

  router.post(
    '/link/request',
    requireAuth,
    credentialLimiter,
    validate({ body: requestBody }),
    async (req, res) => {
      await phoneService.requestLinkCode(req.auth.userId, req.validated.body.phone);
      res.status(202).json({ sent: true });
    },
  );

  router.post(
    '/link/verify',
    requireAuth,
    credentialLimiter,
    validate({ body: linkVerifyBody }),
    async (req, res) => {
      const user = await phoneService.verifyLink(req.auth.userId, req.validated.body);
      res.json({ user: toSelfUser(user) });
    },
  );

  router.delete('/', requireAuth, async (req, res) => {
    await phoneService.unlink(req.auth.userId);
    res.status(204).end();
  });

  return router;
}
