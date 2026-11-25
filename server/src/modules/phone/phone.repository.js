import { and, desc, eq, gt, sql } from 'drizzle-orm';
import { phoneCodes } from '../../db/schema.js';

export function createPhoneRepository(db) {
  return {
    async create(values) {
      const [row] = await db.insert(phoneCodes).values(values).returning();
      return row;
    },

    async latest(phone, purpose, nowDate) {
      const [row] = await db
        .select()
        .from(phoneCodes)
        .where(
          and(
            eq(phoneCodes.phone, phone),
            eq(phoneCodes.purpose, purpose),
            gt(phoneCodes.expiresAt, nowDate),
          ),
        )
        .orderBy(desc(phoneCodes.createdAt))
        .limit(1);
      return row ?? null;
    },

    async countSince(phone, since) {
      const [row] = await db
        .select({ count: sql`count(*)`.mapWith(Number) })
        .from(phoneCodes)
        .where(and(eq(phoneCodes.phone, phone), sql`${phoneCodes.createdAt} >= ${since}`));
      return row.count;
    },

    async addAttempt(id) {
      await db
        .update(phoneCodes)
        .set({ attempts: sql`${phoneCodes.attempts} + 1` })
        .where(eq(phoneCodes.id, id));
    },

    async deleteForPhone(phone) {
      await db.delete(phoneCodes).where(eq(phoneCodes.phone, phone));
    },

    async deleteExpired(nowDate) {
      await db.delete(phoneCodes).where(sql`${phoneCodes.expiresAt} < ${nowDate.getTime()}`);
    },
  };
}
