import { ACCESS_COOKIE } from '../modules/auth/cookies.js';
import { unauthorized } from '../utils/errors.js';

/**
 * Require a valid access token cookie. On success req.auth.userId identifies the caller.
 * Expired or invalid tokens yield 401 UNAUTHENTICATED, which tells the client to try a refresh.
 */
export function createRequireAuth({ accessTokens }) {
  return function requireAuth(req, _res, next) {
    const token = req.cookies?.[ACCESS_COOKIE];
    const userId = token ? accessTokens.verify(token) : null;
    if (!userId) {
      next(unauthorized());
      return;
    }
    req.auth = { userId };
    next();
  };
}
