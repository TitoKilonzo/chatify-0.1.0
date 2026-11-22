export const ACCESS_COOKIE = 'chatify_at';
export const REFRESH_COOKIE = 'chatify_rt';

// The refresh cookie is only ever sent to the auth endpoints, which limits where it can leak.
const REFRESH_PATH = '/api/auth';

/**
 * Session cookies: httpOnly, SameSite=Lax, and Secure in production. The access cookie is sent
 * everywhere (including the socket handshake); the refresh cookie only to /api/auth.
 */
export function createSessionCookies({ isProduction, accessTtlSeconds, refreshTtlSeconds }) {
  const base = { httpOnly: true, secure: isProduction, sameSite: 'lax' };

  return {
    set(res, { accessToken, refreshToken }) {
      res.cookie(ACCESS_COOKIE, accessToken, {
        ...base,
        path: '/',
        maxAge: accessTtlSeconds * 1000,
      });
      res.cookie(REFRESH_COOKIE, refreshToken, {
        ...base,
        path: REFRESH_PATH,
        maxAge: refreshTtlSeconds * 1000,
      });
    },

    clear(res) {
      res.clearCookie(ACCESS_COOKIE, { ...base, path: '/' });
      res.clearCookie(REFRESH_COOKIE, { ...base, path: REFRESH_PATH });
    },
  };
}
