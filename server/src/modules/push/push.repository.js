import { and, eq, inArray } from 'drizzle-orm';
import { pushSubscriptions } from '../../db/schema.js';

export function createPushRepository(db) {
  return {
    /** One row per browser endpoint; registering again moves it to the current user. */
    async upsert({ userId, endpoint, p256dh, auth, userAgent }) {
      await db
        .insert(pushSubscriptions)
        .values({ userId, endpoint, p256dh, auth, userAgent: userAgent ?? null })
        .onConflictDoUpdate({
          target: pushSubscriptions.endpoint,
          set: { userId, p256dh, auth, userAgent: userAgent ?? null },
        });
    },

    async removeForUser(userId, endpoint) {
      await db
        .delete(pushSubscriptions)
        .where(and(eq(pushSubscriptions.userId, userId), eq(pushSubscriptions.endpoint, endpoint)));
    },

    async removeByEndpoint(endpoint) {
      await db.delete(pushSubscriptions).where(eq(pushSubscriptions.endpoint, endpoint));
    },

    async listForUsers(userIds) {
      if (userIds.length === 0) {
        return [];
      }
      return db.select().from(pushSubscriptions).where(inArray(pushSubscriptions.userId, userIds));
    },

    async countForUser(userId) {
      const rows = await db
        .select({ id: pushSubscriptions.id })
        .from(pushSubscriptions)
        .where(eq(pushSubscriptions.userId, userId));
      return rows.length;
    },
  };
}
