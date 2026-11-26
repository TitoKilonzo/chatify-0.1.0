import { and, desc, eq, isNull, or } from 'drizzle-orm';
import { callHistory } from '../../db/schema.js';

export function createCallsRepository(db) {
  return {
    async create(values) {
      const [row] = await db.insert(callHistory).values(values).returning();
      return row;
    },

    async markAnswered(id, answeredAt) {
      await db.update(callHistory).set({ answeredAt }).where(eq(callHistory.id, id));
    },

    async finish(id, { outcome, endedBy, endedAt }) {
      await db
        .update(callHistory)
        .set({ outcome, endedBy, endedAt })
        .where(and(eq(callHistory.id, id), isNull(callHistory.endedAt)));
    },

    async listForUser(userId, limit) {
      return db
        .select()
        .from(callHistory)
        .where(or(eq(callHistory.callerId, userId), eq(callHistory.calleeId, userId)))
        .orderBy(desc(callHistory.startedAt), desc(callHistory.id))
        .limit(limit);
    },
  };
}
