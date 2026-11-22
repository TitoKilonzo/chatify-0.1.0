import { and, eq, gt, isNull } from 'drizzle-orm';
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
          .set({ revokedAt: now })
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
