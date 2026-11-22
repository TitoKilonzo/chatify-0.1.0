import { createHash, randomBytes } from 'node:crypto';
import jwt from 'jsonwebtoken';

const ISSUER = 'chatify';
const ALGORITHM = 'HS256';

/** Opaque, high-entropy refresh token. Only its SHA-256 hash is ever stored. */
export function generateRefreshToken() {
  return randomBytes(32).toString('base64url');
}

export function hashToken(token) {
  return createHash('sha256').update(token).digest('hex');
}

/**
 * Short-lived signed access tokens. The algorithm is pinned on both sign and verify so a token
 * cannot downgrade to "none" or switch to an asymmetric algorithm.
 */
export function createAccessTokens({ secret, ttlSeconds }) {
  function sign(userId) {
    return jwt.sign({}, secret, {
      algorithm: ALGORITHM,
      issuer: ISSUER,
      subject: userId,
      expiresIn: ttlSeconds,
    });
  }

  /** Returns the user id for a valid token, or null for anything else. */
  function verify(token) {
    try {
      const payload = jwt.verify(token, secret, { algorithms: [ALGORITHM], issuer: ISSUER });
      return typeof payload.sub === 'string' ? payload.sub : null;
    } catch {
      return null;
    }
  }

  return { sign, verify };
}
