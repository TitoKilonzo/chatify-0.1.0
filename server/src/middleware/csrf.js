import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { forbidden } from '../utils/errors.js';

export const CSRF_COOKIE = 'chatify_csrf';
export const CSRF_HEADER = 'x-csrf-token';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);
const COOKIE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

function safeEqual(a, b) {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

/**
 * CSRF protection for cookie-authenticated routes using the signed double-submit pattern, plus an
 * Origin allow-list check.
 *
 * The server hands out a token of the form "<random>.<hmac>" in a JavaScript-readable cookie.
 * Every state-changing request must echo it in the X-CSRF-Token header. A cross-site page can
 * neither read the cookie nor set the header, and because the token is signed an attacker who can
 * plant a cookie (for example from a sibling subdomain) still cannot forge a valid one.
 */
export function createCsrf({ secret, allowedOrigins, isProduction }) {
  function sign(value) {
    return createHmac('sha256', secret).update(`csrf:${value}`).digest('base64url');
  }

  function issueToken() {
    const value = randomBytes(24).toString('base64url');
    return `${value}.${sign(value)}`;
  }

  function isValidToken(token) {
    if (typeof token !== 'string') {
      return false;
    }
    const [value, signature, ...rest] = token.split('.');
    return (
      Boolean(value) && Boolean(signature) && rest.length === 0 && safeEqual(sign(value), signature)
    );
  }

  /** Return the caller's current token, issuing and setting a new cookie when there is none. */
  function ensureToken(req, res) {
    const existing = req.cookies?.[CSRF_COOKIE];
    if (isValidToken(existing)) {
      return existing;
    }
    const token = issueToken();
    res.cookie(CSRF_COOKIE, token, {
      httpOnly: false,
      secure: isProduction,
      sameSite: 'lax',
      path: '/',
      maxAge: COOKIE_MAX_AGE_MS,
    });
    return token;
  }

  function protect(req, _res, next) {
    if (SAFE_METHODS.has(req.method)) {
      next();
      return;
    }

    const origin = req.get('origin');
    if (origin && !allowedOrigins.includes(origin)) {
      next(forbidden('ORIGIN_NOT_ALLOWED', 'Request origin is not allowed'));
      return;
    }

    const cookieToken = req.cookies?.[CSRF_COOKIE];
    const headerToken = req.get(CSRF_HEADER);
    if (
      !cookieToken ||
      !headerToken ||
      !safeEqual(cookieToken, headerToken) ||
      !isValidToken(cookieToken)
    ) {
      next(forbidden('CSRF_INVALID', 'Missing or invalid CSRF token'));
      return;
    }
    next();
  }

  return { protect, ensureToken, issueToken, isValidToken };
}
