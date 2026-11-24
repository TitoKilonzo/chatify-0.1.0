import { and, asc, desc, eq, inArray, isNotNull, isNull, lt, or, sql } from 'drizzle-orm';
import { uniqueViolation } from '../../db/errors.js';
import {
  attachments,
  conversationMembers,
  conversations,
  messageReactions,
  messageReceipts,
  messages,
} from '../../db/schema.js';

const withAttachment = (db) =>
  db
    .select({ message: messages, attachment: attachments })
    .from(messages)
    .leftJoin(attachments, eq(attachments.id, messages.attachmentId));

export function createMessagesRepository(db) {
  async function findBySenderClient(senderId, clientId) {
    const [row] = await withAttachment(db).where(
      and(eq(messages.senderId, senderId), eq(messages.clientId, clientId)),
    );
    return row ?? null;
  }

  return {
    async findById(id) {
      const [row] = await withAttachment(db).where(eq(messages.id, id)).limit(1);
      return row ?? null;
    },

    findBySenderClient,

    /** Messages with their attachments for a set of ids, as Map<id, { message, attachment }>. */
    async findManyByIds(ids) {
      if (ids.length === 0) {
        return new Map();
      }
      const rows = await withAttachment(db).where(inArray(messages.id, ids));
      return new Map(rows.map((row) => [row.message.id, row]));
    },

    async reactionsFor(messageIds) {
      if (messageIds.length === 0) {
        return [];
      }
      return db
        .select()
        .from(messageReactions)
        .where(inArray(messageReactions.messageId, messageIds))
        .orderBy(asc(messageReactions.createdAt));
    },

    /** One reaction per user per message: choosing another icon replaces the previous one. */
    async setReaction(messageId, userId, key, createdAt) {
      await db
        .insert(messageReactions)
        .values({ messageId, userId, key, createdAt })
        .onConflictDoUpdate({
          target: [messageReactions.messageId, messageReactions.userId],
          set: { key, createdAt },
        });
    },

    async clearReaction(messageId, userId) {
      await db
        .delete(messageReactions)
        .where(and(eq(messageReactions.messageId, messageId), eq(messageReactions.userId, userId)));
    },

    /** Pin or unpin (pinnedAt null). Returns false when the message was already in that state. */
    async setPinned(id, pinnedAt, pinnedBy) {
      const rows = await db
        .update(messages)
        .set({ pinnedAt, pinnedBy: pinnedAt ? pinnedBy : null })
        .where(
          and(
            eq(messages.id, id),
            isNull(messages.deletedAt),
            pinnedAt ? isNull(messages.pinnedAt) : isNotNull(messages.pinnedAt),
          ),
        )
        .returning({ id: messages.id });
      return rows.length > 0;
    },

    async countPinned(conversationId) {
      const [row] = await db
        .select({ count: sql`count(*)`.mapWith(Number) })
        .from(messages)
        .where(
          and(
            eq(messages.conversationId, conversationId),
            isNotNull(messages.pinnedAt),
            isNull(messages.deletedAt),
          ),
        );
      return row.count;
    },

    async listPinned(conversationId) {
      return withAttachment(db)
        .where(
          and(
            eq(messages.conversationId, conversationId),
            isNotNull(messages.pinnedAt),
            isNull(messages.deletedAt),
          ),
        )
        .orderBy(desc(messages.pinnedAt), desc(messages.id));
    },

    /**
     * Messages whose text contains the term, newest first, limited to conversations the user
     * belongs to. pattern must already be escaped for LIKE (see likePattern in the service).
     */
    async search(userId, pattern, { conversationId, beforeId, limit }) {
      const conditions = [
        eq(conversationMembers.userId, userId),
        isNull(messages.deletedAt),
        sql`${messages.body} LIKE ${pattern} ESCAPE '\\'`,
      ];
      if (conversationId) {
        conditions.push(eq(messages.conversationId, conversationId));
      }
      if (beforeId) {
        conditions.push(lt(messages.id, beforeId));
      }
      return db
        .select({ message: messages, attachment: attachments })
        .from(messages)
        .innerJoin(
          conversationMembers,
          eq(conversationMembers.conversationId, messages.conversationId),
        )
        .leftJoin(attachments, eq(attachments.id, messages.attachmentId))
        .where(and(...conditions))
        .orderBy(desc(messages.id))
        .limit(limit + 1);
    },

    /**
     * Insert a message and bump the conversation's activity time in one transaction.
     * A repeated (senderId, clientId) returns the original row with duplicate: true, which makes
     * client retries after a lost ack idempotent.
     */
    async create({ conversationId, senderId, clientId, body, attachmentId, replyToId, forwarded }) {
      try {
        const id = await db.transaction(async (tx) => {
          const [row] = await tx
            .insert(messages)
            .values({
              conversationId,
              senderId,
              clientId,
              body,
              attachmentId: attachmentId ?? null,
              replyToId: replyToId ?? null,
              forwarded: Boolean(forwarded),
            })
            .returning({ id: messages.id, createdAt: messages.createdAt });
          await tx
            .update(conversations)
            .set({ lastMessageAt: row.createdAt })
            .where(eq(conversations.id, conversationId));
          return row.id;
        });
        const created = await this.findById(id);
        return { ...created, duplicate: false };
      } catch (err) {
        const violation = uniqueViolation(err);
        // SQLite names the first column of a composite index: (sender_id, client_id).
        if (violation?.table === 'messages' && violation.column === 'sender_id') {
          const existing = await findBySenderClient(senderId, clientId);
          if (existing) {
            return { ...existing, duplicate: true };
          }
        }
        throw err;
      }
    },

    /**
     * One page of history, newest first. cursor is { createdAt: ms, id } of the oldest message the
     * client already holds. Fetches limit + 1 rows so the caller can tell whether more exist.
     */
    async listBefore(conversationId, { cursor, limit }) {
      const conditions = [eq(messages.conversationId, conversationId)];
      if (cursor) {
        const at = new Date(cursor.createdAt);
        conditions.push(
          or(
            lt(messages.createdAt, at),
            and(eq(messages.createdAt, at), lt(messages.id, cursor.id)),
          ),
        );
      }
      return withAttachment(db)
        .where(and(...conditions))
        .orderBy(desc(messages.createdAt), desc(messages.id))
        .limit(limit + 1);
    },

    /** Messages across all of the user's conversations with id > afterId, oldest first. */
    async listAfterForUser(userId, { afterId, limit }) {
      return db
        .select({ message: messages, attachment: attachments })
        .from(messages)
        .innerJoin(
          conversationMembers,
          and(
            eq(conversationMembers.conversationId, messages.conversationId),
            eq(conversationMembers.userId, userId),
          ),
        )
        .leftJoin(attachments, eq(attachments.id, messages.attachmentId))
        .where(sql`${messages.id} > ${afterId}`)
        .orderBy(asc(messages.id))
        .limit(limit + 1);
    },

    /** The newest message of each conversation, as Map<conversationId, { message, attachment }>. */
    async lastForConversations(conversationIds) {
      if (conversationIds.length === 0) {
        return new Map();
      }
      const latest = await db
        .select({ id: sql`max(${messages.id})`.mapWith(Number) })
        .from(messages)
        .where(inArray(messages.conversationId, conversationIds))
        .groupBy(messages.conversationId);
      if (latest.length === 0) {
        return new Map();
      }
      const rows = await withAttachment(db).where(
        inArray(
          messages.id,
          latest.map((row) => row.id),
        ),
      );
      return new Map(rows.map((row) => [row.message.conversationId, row]));
    },

    async latestId(conversationId) {
      const [row] = await db
        .select({ id: sql`max(${messages.id})`.mapWith(Number) })
        .from(messages)
        .where(eq(messages.conversationId, conversationId));
      return row?.id ?? null;
    },

    /** Edit the body of the sender's own live message. Returns null when not editable. */
    async updateBody(id, senderId, body, editedAt) {
      const rows = await db
        .update(messages)
        .set({ body, editedAt })
        .where(
          and(eq(messages.id, id), eq(messages.senderId, senderId), isNull(messages.deletedAt)),
        )
        .returning({ id: messages.id });
      return rows.length > 0;
    },

    /**
     * Soft delete: the row stays as a tombstone so ordering and receipts stay intact, but the body
     * and attachment link are cleared. Returns the detached attachment id, if any.
     */
    async softDelete(id, senderId, deletedAt) {
      return db.transaction(async (tx) => {
        const [current] = await tx
          .select({ attachmentId: messages.attachmentId })
          .from(messages)
          .where(
            and(eq(messages.id, id), eq(messages.senderId, senderId), isNull(messages.deletedAt)),
          );
        if (!current) {
          return null;
        }
        await tx
          .update(messages)
          .set({ body: '', deletedAt, attachmentId: null })
          .where(eq(messages.id, id));
        return { attachmentId: current.attachmentId };
      });
    },

    /** Receipts for a set of messages, as rows of { messageId, userId, deliveredAt, readAt }. */
    async receiptsFor(messageIds) {
      if (messageIds.length === 0) {
        return [];
      }
      return db
        .select()
        .from(messageReceipts)
        .where(inArray(messageReceipts.messageId, messageIds));
    },

    /**
     * Mark every message from other senders with id <= upToId as delivered to userId.
     * Returns the highest message id that changed, or null when nothing changed.
     */
    async markDelivered(userId, conversationId, upToId, nowMs) {
      const rows = await db.all(sql`
        INSERT INTO message_receipts (message_id, user_id, delivered_at)
        SELECT m.id, ${userId}, ${nowMs}
        FROM messages m
        WHERE m.conversation_id = ${conversationId}
          AND m.id <= ${upToId}
          AND m.sender_id != ${userId}
        ON CONFLICT (message_id, user_id) DO NOTHING
        RETURNING message_id
      `);
      return maxOf(rows);
    },

    /**
     * Mark messages up to upToId as read by userId and advance the member's read pointer, never
     * backwards. Returns { effective, advanced, receiptsChanged }, or null when the conversation
     * has no message at or below upToId.
     */
    async markRead(userId, conversationId, upToId, nowMs) {
      return db.transaction(async (tx) => {
        const [bound] = await tx.all(sql`
          SELECT max(id) AS id FROM messages
          WHERE conversation_id = ${conversationId} AND id <= ${upToId}
        `);
        const effective = bound?.id ?? null;
        if (effective === null) {
          return null;
        }

        const advanced = await tx.all(sql`
          UPDATE conversation_members SET last_read_message_id = ${effective}
          WHERE conversation_id = ${conversationId} AND user_id = ${userId}
            AND (last_read_message_id IS NULL OR last_read_message_id < ${effective})
          RETURNING user_id
        `);

        const changed = await tx.all(sql`
          INSERT INTO message_receipts (message_id, user_id, delivered_at, read_at)
          SELECT m.id, ${userId}, ${nowMs}, ${nowMs}
          FROM messages m
          WHERE m.conversation_id = ${conversationId}
            AND m.id <= ${effective}
            AND m.sender_id != ${userId}
          ON CONFLICT (message_id, user_id) DO UPDATE
            SET read_at = excluded.read_at,
                delivered_at = COALESCE(message_receipts.delivered_at, excluded.delivered_at)
            WHERE message_receipts.read_at IS NULL
          RETURNING message_id
        `);

        return {
          effective,
          advanced: advanced.length > 0,
          receiptsChanged: changed.length > 0,
        };
      });
    },
  };
}

function maxOf(rows) {
  if (rows.length === 0) {
    return null;
  }
  return Math.max(...rows.map((row) => Number(row.message_id)));
}
