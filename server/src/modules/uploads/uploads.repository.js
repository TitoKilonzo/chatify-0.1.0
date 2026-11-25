import { and, eq, lt, sql } from 'drizzle-orm';
import { uploadSessions } from '../../db/schema.js';

export function createUploadsRepository(db) {
  return {
    async create(values) {
      const [row] = await db.insert(uploadSessions).values(values).returning();
      return row;
    },

    async findForUser(id, userId) {
      const [row] = await db
        .select()
        .from(uploadSessions)
        .where(and(eq(uploadSessions.id, id), eq(uploadSessions.userId, userId)))
        .limit(1);
      return row ?? null;
    },

    async countForUser(userId) {
      const [row] = await db
        .select({ count: sql`count(*)`.mapWith(Number) })
        .from(uploadSessions)
        .where(eq(uploadSessions.userId, userId));
      return row.count;
    },

    async setOffset(id, offsetBytes, updatedAt) {
      await db
        .update(uploadSessions)
        .set({ offsetBytes, updatedAt })
        .where(eq(uploadSessions.id, id));
    },

    async delete(id) {
      await db.delete(uploadSessions).where(eq(uploadSessions.id, id));
    },

    async listStale(cutoff, limit) {
      return db
        .select()
        .from(uploadSessions)
        .where(lt(uploadSessions.updatedAt, cutoff))
        .limit(limit);
    },
  };
}
