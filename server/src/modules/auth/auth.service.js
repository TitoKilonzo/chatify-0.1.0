import { randomUUID } from 'node:crypto';
import { uniqueViolation } from '../../db/errors.js';
import { AppError, conflict, tooManyRequests, unauthorized } from '../../utils/errors.js';
import { generateRefreshToken, hashToken } from './tokens.js';

// Two tabs can refresh at the same moment with the same cookie. A token revoked this recently is
// treated as a benign race instead of theft, so the user is not signed out everywhere.
export const REFRESH_REUSE_GRACE_MS = 10_000;

function invalidCredentials() {
  return unauthorized('INVALID_CREDENTIALS', 'Incorrect email, username, or password');
}

function refreshRejected() {
  return unauthorized('REFRESH_REJECTED', 'Session expired, please sign in again');
}

/**
 * Authentication business logic. Knows nothing about HTTP: controllers translate requests and
 * cookies into the plain arguments used here.
 */
export function createAuthService({
  usersRepository,
  refreshTokensRepository,
  hasher,
  accessTokens,
  config,
  events,
  now = () => new Date(),
}) {
  const refreshTtlMs = config.refreshTtlSeconds * 1000;
  const lockoutMs = config.lockoutMinutes * 60 * 1000;

  async function issueSession(user, userAgent) {
    const refreshToken = generateRefreshToken();
    const started = now();
    const sessionId = randomUUID();
    await refreshTokensRepository.create({
      userId: user.id,
      tokenHash: hashToken(refreshToken),
      expiresAt: new Date(started.getTime() + refreshTtlMs),
      userAgent: userAgent ?? null,
      sessionId,
      sessionStartedAt: started,
      lastUsedAt: started,
    });
    return { user, accessToken: accessTokens.sign(user.id, sessionId), refreshToken, sessionId };
  }

  return {
    /** Start a session for a user whose identity was already proven (for example by SMS code). */
    startSession: (user, { userAgent } = {}) => issueSession(user, userAgent),

    async register({ displayName, username, email, password }, { userAgent } = {}) {
      const passwordHash = await hasher.hash(password);
      let user;
      try {
        user = await usersRepository.create({ displayName, username, email, passwordHash });
      } catch (err) {
        const violation = uniqueViolation(err);
        if (violation?.column === 'username') {
          throw conflict('USERNAME_TAKEN', 'That username is already taken', [
            { path: 'username', message: 'That username is already taken' },
          ]);
        }
        if (violation?.column === 'email') {
          throw conflict('EMAIL_TAKEN', 'An account with that email already exists', [
            { path: 'email', message: 'An account with that email already exists' },
          ]);
        }
        throw err;
      }
      return issueSession(user, userAgent);
    },

    async login({ identifier, password }, { userAgent } = {}) {
      const user = await usersRepository.findByIdentifier(identifier);
      if (!user) {
        await hasher.verifyDummy(password);
        throw invalidCredentials();
      }

      const current = now();
      if (user.lockedUntil && user.lockedUntil > current) {
        const minutes = Math.ceil((user.lockedUntil.getTime() - current.getTime()) / 60_000);
        throw tooManyRequests(
          'ACCOUNT_LOCKED',
          `Too many failed attempts. Try again in ${minutes} minute${minutes === 1 ? '' : 's'}.`,
        );
      }

      const valid = await hasher.verify(user.passwordHash, password);
      if (!valid) {
        await usersRepository.recordFailedLogin(user.id, {
          maxFailures: config.maxLoginFailures,
          lockedUntil: new Date(current.getTime() + lockoutMs),
        });
        throw invalidCredentials();
      }

      if (user.failedLoginCount > 0 || user.lockedUntil) {
        await usersRepository.clearLoginFailures(user.id);
      }
      return issueSession(user, userAgent);
    },

    /**
     * Exchange a refresh token for a new session, rotating the token. Presenting a token that was
     * revoked long ago means it leaked or was replayed, so every session of that user is revoked.
     */
    async refresh(rawToken, { userAgent } = {}) {
      if (!rawToken) {
        throw refreshRejected();
      }
      const row = await refreshTokensRepository.findByHash(hashToken(rawToken));
      if (!row) {
        throw refreshRejected();
      }

      const current = now();
      if (row.revokedAt) {
        // Ended from the device list: this device is simply signed out. Not a sign of theft.
        if (row.revokedReason === 'device') {
          throw refreshRejected();
        }
        if (current.getTime() - row.revokedAt.getTime() <= REFRESH_REUSE_GRACE_MS) {
          throw new AppError(401, 'REFRESH_RACE', 'Session refresh already in progress');
        }
        await refreshTokensRepository.revokeAllForUser(row.userId, current);
        events?.publish('user.sessions-revoked', { userId: row.userId, reason: 'token-reuse' });
        throw refreshRejected();
      }
      if (row.expiresAt <= current) {
        throw refreshRejected();
      }

      const user = await usersRepository.findById(row.userId);
      if (!user) {
        throw refreshRejected();
      }

      const refreshToken = generateRefreshToken();
      const sessionId = row.sessionId ?? row.id;
      const rotated = await refreshTokensRepository.rotate({
        oldId: row.id,
        now: current,
        next: {
          userId: user.id,
          tokenHash: hashToken(refreshToken),
          expiresAt: new Date(current.getTime() + refreshTtlMs),
          userAgent: userAgent ?? null,
          sessionId,
          sessionStartedAt: row.sessionStartedAt ?? row.createdAt,
          lastUsedAt: current,
        },
      });
      if (!rotated) {
        throw new AppError(401, 'REFRESH_RACE', 'Session refresh already in progress');
      }
      return { user, accessToken: accessTokens.sign(user.id, sessionId), refreshToken, sessionId };
    },

    /** Revoke the presented refresh token. Always succeeds, even for unknown tokens. */
    async logout(rawToken) {
      if (!rawToken) {
        return;
      }
      const row = await refreshTokensRepository.findByHash(hashToken(rawToken));
      if (row && !row.revokedAt) {
        await refreshTokensRepository.revoke(row.id, now());
        events?.publish('user.sessions-revoked', { userId: row.userId, reason: 'logout' });
      }
    },

    /** The devices signed in as this user. currentToken marks the caller's own session. */
    async listSessions(userId, currentToken) {
      const current = currentToken
        ? await refreshTokensRepository.findByHash(hashToken(currentToken))
        : null;
      const currentId =
        current && current.userId === userId ? (current.sessionId ?? current.id) : null;
      const rows = await refreshTokensRepository.listActive(userId, now());
      return rows.map((row) => {
        const id = row.sessionId ?? row.id;
        return {
          id,
          userAgent: row.userAgent,
          startedAt: row.sessionStartedAt ?? row.createdAt,
          lastActiveAt: row.lastUsedAt ?? row.createdAt,
          current: id === currentId,
        };
      });
    },

    /** End one session. Returns whether it was the caller's own. */
    async revokeSession(userId, sessionId, currentToken) {
      const ended = await refreshTokensRepository.revokeSession(userId, sessionId, now());
      if (ended === 0) {
        throw new AppError(404, 'SESSION_NOT_FOUND', 'Session not found');
      }
      events?.publish('user.sessions-revoked', {
        userId,
        sessionIds: [sessionId],
        reason: 'device',
      });
      const current = currentToken
        ? await refreshTokensRepository.findByHash(hashToken(currentToken))
        : null;
      return { own: Boolean(current && (current.sessionId ?? current.id) === sessionId) };
    },

    /** Sign out every device except the caller's. */
    async revokeOtherSessions(userId, currentToken) {
      const current = currentToken
        ? await refreshTokensRepository.findByHash(hashToken(currentToken))
        : null;
      if (!current || current.userId !== userId) {
        throw unauthorized();
      }
      const ended = await refreshTokensRepository.revokeOthers(
        userId,
        current.sessionId ?? current.id,
        now(),
      );
      if (ended.length > 0) {
        events?.publish('user.sessions-revoked', { userId, sessionIds: ended, reason: 'device' });
      }
      return { revoked: new Set(ended).size };
    },

    async isSessionActive(userId, sessionId) {
      return refreshTokensRepository.isSessionActive(userId, sessionId, now());
    },

    async getUser(userId) {
      return usersRepository.findById(userId);
    },

    /**
     * Change the password, revoke every existing session, and start a fresh one for the device
     * that made the change.
     */
    async changePassword(userId, { currentPassword, newPassword }, { userAgent } = {}) {
      const user = await usersRepository.findById(userId);
      if (!user) {
        throw unauthorized();
      }
      const valid = await hasher.verify(user.passwordHash, currentPassword);
      if (!valid) {
        throw new AppError(400, 'INVALID_CURRENT_PASSWORD', 'Current password is incorrect', [
          { path: 'currentPassword', message: 'Current password is incorrect' },
        ]);
      }

      const passwordHash = await hasher.hash(newPassword);
      const updated = await usersRepository.update(userId, { passwordHash });
      await refreshTokensRepository.revokeAllForUser(userId, now());
      const session = await issueSession(updated, userAgent);
      events?.publish('user.sessions-revoked', { userId, reason: 'password-changed' });
      return session;
    },
  };
}
