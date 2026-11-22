import { toSelfUser } from './users.serializer.js';

export function createUsersController({ usersService, authService, sessionCookies }) {
  return {
    async updateProfile(req, res) {
      const user = await usersService.updateDisplayName(
        req.auth.userId,
        req.validated.body.displayName,
      );
      res.json({ user: toSelfUser(user) });
    },

    async changePassword(req, res) {
      const session = await authService.changePassword(req.auth.userId, req.validated.body, {
        userAgent: req.get('user-agent')?.slice(0, 255),
      });
      sessionCookies.set(res, session);
      res.status(204).end();
    },

    async search(req, res) {
      const { q, limit } = req.validated.query;
      res.json({ users: await usersService.search(req.auth.userId, q, limit) });
    },
  };
}
