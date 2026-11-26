import { unauthorized } from '../../utils/errors.js';
import { toSelfUser } from '../users/users.serializer.js';
import { REFRESH_COOKIE } from './cookies.js';

function userAgentOf(req) {
  return req.get('user-agent')?.slice(0, 255);
}

export function createAuthController({ authService, sessionCookies, csrf }) {
  function respondWithSession(res, session, status = 200) {
    sessionCookies.set(res, session);
    res.status(status).json({ user: toSelfUser(session.user) });
  }

  return {
    csrfToken(req, res) {
      res.json({ csrfToken: csrf.ensureToken(req, res) });
    },

    async register(req, res) {
      const session = await authService.register(req.validated.body, {
        userAgent: userAgentOf(req),
      });
      respondWithSession(res, session, 201);
    },

    async login(req, res) {
      const session = await authService.login(req.validated.body, { userAgent: userAgentOf(req) });
      respondWithSession(res, session);
    },

    async refresh(req, res) {
      const session = await authService.refresh(req.cookies?.[REFRESH_COOKIE], {
        userAgent: userAgentOf(req),
      });
      respondWithSession(res, session);
    },

    async logout(req, res) {
      await authService.logout(req.cookies?.[REFRESH_COOKIE]);
      sessionCookies.clear(res);
      res.status(204).end();
    },

    async listSessions(req, res) {
      const sessions = await authService.listSessions(
        req.auth.userId,
        req.cookies?.[REFRESH_COOKIE],
      );
      res.json({ sessions });
    },

    async revokeSession(req, res) {
      const { own } = await authService.revokeSession(
        req.auth.userId,
        req.validated.params.sessionId,
        req.cookies?.[REFRESH_COOKIE],
      );
      if (own) {
        sessionCookies.clear(res);
      }
      res.status(204).end();
    },

    async revokeOtherSessions(req, res) {
      const result = await authService.revokeOtherSessions(
        req.auth.userId,
        req.cookies?.[REFRESH_COOKIE],
      );
      res.json(result);
    },

    async me(req, res) {
      const user = await authService.getUser(req.auth.userId);
      if (!user) {
        throw unauthorized();
      }
      res.json({ user: toSelfUser(user) });
    },
  };
}
