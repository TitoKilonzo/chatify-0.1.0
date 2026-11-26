import { and, desc, eq, gt, isNull, ne, or } from 'drizzle-orm';
import { refreshTokens } from '../../db/schema.js';

export function createRefreshTokensRepository(db) {
  return {
    async create(values) {
      await db.insert(refreshTokens).values(values);
    },

    async findByHash(tokenHash) {
      const [row] = await db
        .select()
        .from(refreshTokens)
        .where(eq(refreshTokens.tokenHash, tokenHash))
        .limit(1);
      return row ?? null;
    },

    /** Revoke one token if it is still active. Returns true when this call revoked it. */
    async revoke(id, now) {
      const rows = await db
        .update(refreshTokens)
        .set({ revokedAt: now })
        .where(and(eq(refreshTokens.id, id), isNull(refreshTokens.revokedAt)))
        .returning({ id: refreshTokens.id });
      return rows.length > 0;
    },

    /** True when the user has at least one unrevoked, unexpired session. */
    async hasActiveForUser(userId, now) {
      const [row] = await db
        .select({ id: refreshTokens.id })
        .from(refreshTokens)
        .where(
          and(
            eq(refreshTokens.userId, userId),
            isNull(refreshTokens.revokedAt),
            gt(refreshTokens.expiresAt, now),
          ),
        )
        .limit(1);
      return Boolean(row);
    },

    /** Active sessions of a user, newest activity first. One row per session (its live token). */
    async listActive(userId, now) {
      return db
        .select()
        .from(refreshTokens)
        .where(
          and(
            eq(refreshTokens.userId, userId),
            isNull(refreshTokens.revokedAt),
            gt(refreshTokens.expiresAt, now),
          ),
        )
        .orderBy(desc(refreshTokens.lastUsedAt), desc(refreshTokens.createdAt));
    },

    /** True while the session still has an unrevoked, unexpired token. */
    async isSessionActive(userId, sessionId, now) {
      const [row] = await db
        .select({ id: refreshTokens.id })
        .from(refreshTokens)
        .where(
          and(
            eq(refreshTokens.userId, userId),
            or(eq(refreshTokens.sessionId, sessionId), eq(refreshTokens.id, sessionId)),
            isNull(refreshTokens.revokedAt),
            gt(refreshTokens.expiresAt, now),
          ),
        )
        .limit(1);
      return Boolean(row);
    },

    /** End one session. Returns the number of tokens revoked (0 when it is not this user's). */
    async revokeSession(userId, sessionId, now) {
      const rows = await db
        .update(refreshTokens)
        .set({ revokedAt: now, revokedReason: 'device' })
        .where(
          and(
            eq(refreshTokens.userId, userId),
            or(eq(refreshTokens.sessionId, sessionId), eq(refreshTokens.id, sessionId)),
            isNull(refreshTokens.revokedAt),
          ),
        )
        .returning({ id: refreshTokens.id });
      return rows.length;
    },

    /** End every session except one. Returns the session ids that were ended. */
    async revokeOthers(userId, keepSessionId, now) {
      const rows = await db
        .update(refreshTokens)
        .set({ revokedAt: now, revokedReason: 'device' })
        .where(
          and(
            eq(refreshTokens.userId, userId),
            isNull(refreshTokens.revokedAt),
            ne(refreshTokens.id, keepSessionId),
            or(isNull(refreshTokens.sessionId), ne(refreshTokens.sessionId, keepSessionId)),
          ),
        )
        .returning({ id: refreshTokens.id, sessionId: refreshTokens.sessionId });
      return rows.map((row) => row.sessionId ?? row.id);
    },

    async revokeAllForUser(userId, now) {
      await db
        .update(refreshTokens)
        .set({ revokedAt: now })
        .where(and(eq(refreshTokens.userId, userId), isNull(refreshTokens.revokedAt)));
    },

    /**
     * Rotate in one transaction: revoke the old token, then store its replacement. Returns false
     * when another request already revoked the old token, in which case nothing is written.
     */
    async rotate({ oldId, now, next }) {
      return db.transaction(async (tx) => {
        const revoked = await tx
          .update(refreshTokens)
          .set({ revokedAt: now, revokedReason: 'rotated' })
          .where(and(eq(refreshTokens.id, oldId), isNull(refreshTokens.revokedAt)))
          .returning({ id: refreshTokens.id });
        if (revoked.length === 0) {
          return false;
        }
        await tx.insert(refreshTokens).values(next);
        return true;
      });
    },
  };
}
