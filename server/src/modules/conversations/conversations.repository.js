import { and, asc, eq, inArray, isNotNull, ne, sql } from 'drizzle-orm';
import { uniqueViolation } from '../../db/errors.js';
import { conversationMembers, conversations, users } from '../../db/schema.js';

export const MAX_LIST = 500;

export function directKeyFor(a, b) {
  return [a, b].sort().join(':');
}

export function createConversationsRepository(db) {
  async function findById(id, executor = db) {
    const [row] = await executor
      .select()
      .from(conversations)
      .where(eq(conversations.id, id))
      .limit(1);
    return row ?? null;
  }

  return {
    findById,

    async findMember(conversationId, userId) {
      const [row] = await db
        .select()
        .from(conversationMembers)
        .where(
          and(
            eq(conversationMembers.conversationId, conversationId),
            eq(conversationMembers.userId, userId),
          ),
        )
        .limit(1);
      return row ?? null;
    },

    async listMemberIds(conversationId) {
      const rows = await db
        .select({ userId: conversationMembers.userId })
        .from(conversationMembers)
        .where(eq(conversationMembers.conversationId, conversationId));
      return rows.map((row) => row.userId);
    },

    /** Member ids for many conversations at once, as Map<conversationId, userId[]>. */
    async listMemberIdsFor(conversationIds) {
      const result = new Map(conversationIds.map((id) => [id, []]));
      if (conversationIds.length === 0) {
        return result;
      }
      const rows = await db
        .select({
          conversationId: conversationMembers.conversationId,
          userId: conversationMembers.userId,
        })
        .from(conversationMembers)
        .where(inArray(conversationMembers.conversationId, conversationIds));
      for (const row of rows) {
        result.get(row.conversationId).push(row.userId);
      }
      return result;
    },

    /** Members joined with their user rows, oldest member first. */
    async listMembers(conversationId) {
      return db
        .select({ member: conversationMembers, user: users })
        .from(conversationMembers)
        .innerJoin(users, eq(users.id, conversationMembers.userId))
        .where(eq(conversationMembers.conversationId, conversationId))
        .orderBy(asc(conversationMembers.joinedAt), asc(users.id));
    },

    async countMembers(conversationId) {
      const [row] = await db
        .select({ count: sql`count(*)`.mapWith(Number) })
        .from(conversationMembers)
        .where(eq(conversationMembers.conversationId, conversationId));
      return row.count;
    },

    /** Ids of every user who shares at least one conversation with userId. */
    async listPeerIds(userId) {
      const rows = await db.all(sql`
        SELECT DISTINCT other.user_id AS id
        FROM conversation_members mine
        JOIN conversation_members other ON other.conversation_id = mine.conversation_id
        WHERE mine.user_id = ${userId} AND other.user_id != ${userId}
      `);
      return rows.map((row) => row.id);
    },

    /** Conversation ids the user belongs to. Used to join realtime rooms. */
    async listConversationIds(userId) {
      const rows = await db
        .select({ id: conversationMembers.conversationId })
        .from(conversationMembers)
        .where(eq(conversationMembers.userId, userId));
      return rows.map((row) => row.id);
    },

    /**
     * Get or create the direct conversation for a pair. Safe under races: the unique direct_key
     * makes the second concurrent creator fail, and it then reads the winner's row.
     */
    async getOrCreateDirect(userId, otherId) {
      const directKey = directKeyFor(userId, otherId);
      const existing = await findByDirectKey(db, directKey);
      if (existing) {
        return { conversation: existing, created: false };
      }
      try {
        const conversation = await db.transaction(async (tx) => {
          const [row] = await tx
            .insert(conversations)
            .values({ type: 'direct', directKey, createdBy: userId })
            .returning();
          await tx.insert(conversationMembers).values([
            { conversationId: row.id, userId, role: 'member' },
            { conversationId: row.id, userId: otherId, role: 'member' },
          ]);
          return row;
        });
        return { conversation, created: true };
      } catch (err) {
        if (uniqueViolation(err)?.column === 'direct_key') {
          return { conversation: await findByDirectKey(db, directKey), created: false };
        }
        throw err;
      }
    },

    async createGroup({
      name,
      createdBy,
      memberIds,
      broadcast = false,
      description = null,
      isPublic = false,
    }) {
      return db.transaction(async (tx) => {
        const [row] = await tx
          .insert(conversations)
          .values({ type: 'group', name, createdBy, broadcast, description, isPublic })
          .returning();
        await tx.insert(conversationMembers).values([
          { conversationId: row.id, userId: createdBy, role: 'owner' },
          ...memberIds.map((userId) => ({
            conversationId: row.id,
            userId,
            role: 'member',
          })),
        ]);
        return row;
      });
    },

    /** Public channels whose name or description contains the text, minus the ones already joined. */
    async searchPublicChannels(userId, query, limit) {
      const pattern = `%${query.replace(/[\\%_]/g, (ch) => `\\${ch}`)}%`;
      const rows = await db
        .select({
          conversation: conversations,
          memberCount: sql`count(${conversationMembers.userId})`,
        })
        .from(conversations)
        .innerJoin(conversationMembers, eq(conversationMembers.conversationId, conversations.id))
        .where(
          and(
            eq(conversations.broadcast, true),
            eq(conversations.isPublic, true),
            query
              ? sql`(${conversations.name} LIKE ${pattern} ESCAPE '\\' OR ${conversations.description} LIKE ${pattern} ESCAPE '\\')`
              : sql`1 = 1`,
            sql`${conversations.id} NOT IN (SELECT conversation_id FROM conversation_members WHERE user_id = ${userId})`,
          ),
        )
        .groupBy(conversations.id)
        .orderBy(sql`count(${conversationMembers.userId}) DESC`, sql`${conversations.id} DESC`)
        .limit(limit);
      return rows.map((row) => ({
        conversation: row.conversation,
        memberCount: Number(row.memberCount),
      }));
    },

    async updateConversation(id, values) {
      const [row] = await db
        .update(conversations)
        .set(values)
        .where(eq(conversations.id, id))
        .returning();
      return row ?? null;
    },

    async addMembers(conversationId, userIds) {
      if (userIds.length === 0) {
        return;
      }
      await db
        .insert(conversationMembers)
        .values(userIds.map((userId) => ({ conversationId, userId, role: 'member' })))
        .onConflictDoNothing();
    },

    async removeMember(conversationId, userId) {
      const rows = await db
        .delete(conversationMembers)
        .where(
          and(
            eq(conversationMembers.conversationId, conversationId),
            eq(conversationMembers.userId, userId),
          ),
        )
        .returning({ userId: conversationMembers.userId });
      return rows.length > 0;
    },

    async setRole(conversationId, userId, role) {
      await db
        .update(conversationMembers)
        .set({ role })
        .where(
          and(
            eq(conversationMembers.conversationId, conversationId),
            eq(conversationMembers.userId, userId),
          ),
        );
    },

    async setPreferences(conversationId, userId, values) {
      await db
        .update(conversationMembers)
        .set(values)
        .where(
          and(
            eq(conversationMembers.conversationId, conversationId),
            eq(conversationMembers.userId, userId),
          ),
        );
    },

    async deleteConversation(id) {
      await db.delete(conversations).where(eq(conversations.id, id));
    },

    /**
     * The inbox: every conversation of the user with per-user state, newest activity first.
     * Returns plain rows; the service shapes them for the API.
     */
    async listForUser(userId) {
      const rows = await db
        .select({ conversation: conversations, member: conversationMembers })
        .from(conversationMembers)
        .innerJoin(conversations, eq(conversations.id, conversationMembers.conversationId))
        .where(eq(conversationMembers.userId, userId))
        .orderBy(sql`${conversations.lastMessageAt} DESC`, sql`${conversations.id} DESC`)
        .limit(MAX_LIST);
      if (rows.length === 0) {
        return { rows, unread: new Map(), counterparts: new Map(), memberCounts: new Map() };
      }

      const ids = rows.map((row) => row.conversation.id);
      const groupIds = rows
        .filter((row) => row.conversation.type === 'group')
        .map((r) => r.conversation.id);
      const directIds = rows
        .filter((row) => row.conversation.type === 'direct')
        .map((r) => r.conversation.id);

      const unreadRows = await db.all(sql`
        SELECT m.conversation_id AS conversation_id, count(*) AS unread
        FROM messages m
        JOIN conversation_members cm
          ON cm.conversation_id = m.conversation_id AND cm.user_id = ${userId}
        WHERE m.conversation_id IN (${sql.join(
          ids.map((id) => sql`${id}`),
          sql`, `,
        )})
          AND m.sender_id != ${userId}
          AND m.deleted_at IS NULL
          AND m.id > COALESCE(cm.last_read_message_id, 0)
        GROUP BY m.conversation_id
      `);
      const unread = new Map(unreadRows.map((r) => [r.conversation_id, Number(r.unread)]));

      const counterparts = new Map();
      if (directIds.length > 0) {
        const others = await db
          .select({ conversationId: conversationMembers.conversationId, user: users })
          .from(conversationMembers)
          .innerJoin(users, eq(users.id, conversationMembers.userId))
          .where(
            and(
              inArray(conversationMembers.conversationId, directIds),
              ne(conversationMembers.userId, userId),
            ),
          );
        for (const other of others) {
          counterparts.set(other.conversationId, other.user);
        }
      }

      const memberCounts = new Map();
      if (groupIds.length > 0) {
        const counts = await db
          .select({
            conversationId: conversationMembers.conversationId,
            count: sql`count(*)`.mapWith(Number),
          })
          .from(conversationMembers)
          .where(inArray(conversationMembers.conversationId, groupIds))
          .groupBy(conversationMembers.conversationId);
        for (const row of counts) {
          memberCounts.set(row.conversationId, row.count);
        }
      }

      return { rows, unread, counterparts, memberCounts };
    },

    async unreadCount(conversationId, userId) {
      const [row] = await db.all(sql`
        SELECT count(*) AS unread
        FROM messages m
        JOIN conversation_members cm
          ON cm.conversation_id = m.conversation_id AND cm.user_id = ${userId}
        WHERE m.conversation_id = ${conversationId}
          AND m.sender_id != ${userId}
          AND m.deleted_at IS NULL
          AND m.id > COALESCE(cm.last_read_message_id, 0)
      `);
      return Number(row?.unread ?? 0);
    },
  };
}

async function findByDirectKey(db, directKey) {
  const [row] = await db
    .select()
    .from(conversations)
    .where(and(eq(conversations.directKey, directKey), isNotNull(conversations.directKey)))
    .limit(1);
  return row ?? null;
}
