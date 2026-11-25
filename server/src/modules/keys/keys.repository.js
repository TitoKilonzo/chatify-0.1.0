import { eq } from 'drizzle-orm';
import { userKeys } from '../../db/schema.js';

export function createKeysRepository(db) {
  return {
    async get(userId) {
      const [row] = await db.select().from(userKeys).where(eq(userKeys.userId, userId)).limit(1);
      return row ?? null;
    },

    /** Publishing a different key replaces the old one and drops a backup of the old private key. */
    async upsertPublicKey(userId, publicKey, now) {
      const existing = await this.get(userId);
      if (!existing) {
        await db.insert(userKeys).values({ userId, publicKey, updatedAt: now });
      } else if (existing.publicKey !== publicKey) {
        await db
          .update(userKeys)
          .set({ publicKey, backup: null, updatedAt: now })
          .where(eq(userKeys.userId, userId));
      }
    },

    async setBackup(userId, backup, now) {
      await db.update(userKeys).set({ backup, updatedAt: now }).where(eq(userKeys.userId, userId));
    },
  };
}
