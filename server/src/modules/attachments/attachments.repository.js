import { and, eq, isNull, lt, sql } from 'drizzle-orm';
import { attachments, messages } from '../../db/schema.js';

export function createAttachmentsRepository(db) {
  return {
    async create(values) {
      const [row] = await db.insert(attachments).values(values).returning();
      return row;
    },

    async findById(id) {
      const [row] = await db.select().from(attachments).where(eq(attachments.id, id)).limit(1);
      return row ?? null;
    },

    /**
     * The attachment together with the conversation of the message that carries it.
     * Authorization for downloads is decided from conversationId, so unattached uploads and
     * attachments of deleted messages yield no row.
     */
    async findWithConversation(id) {
      const [row] = await db
        .select({ attachment: attachments, conversationId: messages.conversationId })
        .from(attachments)
        .innerJoin(messages, eq(messages.attachmentId, attachments.id))
        .where(eq(attachments.id, id))
        .limit(1);
      return row ?? null;
    },

    async isAttached(id) {
      const [row] = await db
        .select({ id: messages.id })
        .from(messages)
        .where(eq(messages.attachmentId, id))
        .limit(1);
      return Boolean(row);
    },

    async delete(id) {
      await db.delete(attachments).where(eq(attachments.id, id));
    },

    /** Uploads older than cutoff that no message references. */
    async listOrphans(cutoff, limit) {
      return db
        .select({ attachment: attachments })
        .from(attachments)
        .leftJoin(messages, eq(messages.attachmentId, attachments.id))
        .where(and(isNull(messages.id), lt(attachments.createdAt, cutoff)))
        .limit(limit)
        .then((rows) => rows.map((row) => row.attachment));
    },

    async countForUploader(uploaderId, since) {
      const [row] = await db
        .select({ count: sql`count(*)`.mapWith(Number) })
        .from(attachments)
        .where(
          and(eq(attachments.uploaderId, uploaderId), sql`${attachments.createdAt} >= ${since}`),
        );
      return row.count;
    },
  };
}
