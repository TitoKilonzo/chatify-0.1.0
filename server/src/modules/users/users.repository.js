import { and, eq, inArray, ne, or, sql } from 'drizzle-orm';
import { users } from '../../db/schema.js';

export function createUsersRepository(db) {
  return {
    async findById(id) {
      const [row] = await db.select().from(users).where(eq(users.id, id)).limit(1);
      return row ?? null;
    },

    /** Match a lower-cased email or username. The two formats cannot collide. */
    async findByIdentifier(identifier) {
      const [row] = await db
        .select()
        .from(users)
        .where(or(eq(users.email, identifier), eq(users.username, identifier)))
        .limit(1);
      return row ?? null;
    },

    async findManyByIds(ids) {
      if (ids.length === 0) {
        return [];
      }
      return db.select().from(users).where(inArray(users.id, ids));
    },

    /** Prefix-or-substring search on username and display name. The query is LIKE-escaped. */
    async search(query, { excludeId, limit }) {
      const escaped = query.toLowerCase().replace(/[\\%_]/g, (c) => `\\${c}`);
      const pattern = `%${escaped}%`;
      return db
        .select()
        .from(users)
        .where(
          and(
            ne(users.id, excludeId),
            or(
              sql`lower(${users.username}) LIKE ${pattern} ESCAPE '\\'`,
              sql`lower(${users.displayName}) LIKE ${pattern} ESCAPE '\\'`,
            ),
          ),
        )
        .orderBy(users.displayName)
        .limit(limit);
    },

    async setPresence(id, status, lastSeenAt) {
      await db.update(users).set({ status, lastSeenAt }).where(eq(users.id, id));
    },

    /** Called at boot: no sockets exist yet, so nobody can truthfully be online. */
    async resetAllOffline() {
      await db.update(users).set({ status: 'offline' }).where(eq(users.status, 'online'));
    },

    async create(values) {
      const [row] = await db.insert(users).values(values).returning();
      return row;
    },

    async update(id, values) {
      const [row] = await db.update(users).set(values).where(eq(users.id, id)).returning();
      return row ?? null;
    },

    /**
     * Atomically count a failed login. When the count reaches maxFailures the account is locked
     * until lockedUntil and the counter resets. Returns true when this call locked the account.
     */
    async recordFailedLogin(id, { maxFailures, lockedUntil }) {
      const [row] = await db
        .update(users)
        .set({ failedLoginCount: sql`${users.failedLoginCount} + 1` })
        .where(eq(users.id, id))
        .returning({ count: users.failedLoginCount });

      if (row && row.count >= maxFailures) {
        await db.update(users).set({ failedLoginCount: 0, lockedUntil }).where(eq(users.id, id));
        return true;
      }
      return false;
    },

    async clearLoginFailures(id) {
      await db
        .update(users)
        .set({ failedLoginCount: 0, lockedUntil: null })
        .where(eq(users.id, id));
    },
  };
}
