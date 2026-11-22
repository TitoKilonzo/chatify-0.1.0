import { AppError, conflict, forbidden, notFound, validationFailed } from '../../utils/errors.js';
import { toMessage } from './messages.serializer.js';

export const MAX_BODY_LENGTH = 4000;
export const DEFAULT_PAGE_SIZE = 40;
export const SYNC_PAGE_SIZE = 200;

/**
 * Message business logic. Every entry point proves the caller is a member of the conversation and
 * answers 404 otherwise, so non-members cannot learn whether a conversation or message exists.
 */
export function createMessagesService({
  conversationsRepository,
  messagesRepository,
  attachmentsRepository,
  attachmentsService,
  events,
  logger,
  now = () => new Date(),
}) {
  async function requireMember(conversationId, userId) {
    const member = await conversationsRepository.findMember(conversationId, userId);
    if (!member) {
      throw notFound('Conversation not found');
    }
    return member;
  }

  /** Serialize rows from any mix of conversations with their receipts in two queries. */
  async function serializeRows(rows) {
    if (rows.length === 0) {
      return [];
    }
    const conversationIds = [...new Set(rows.map((row) => row.message.conversationId))];
    const [members, receipts] = await Promise.all([
      conversationsRepository.listMemberIdsFor(conversationIds),
      messagesRepository.receiptsFor(rows.map((row) => row.message.id)),
    ]);
    const receiptsByMessage = new Map();
    for (const receipt of receipts) {
      const list = receiptsByMessage.get(receipt.messageId) ?? [];
      list.push(receipt);
      receiptsByMessage.set(receipt.messageId, list);
    }
    return rows.map((row) =>
      toMessage(row, {
        recipientIds: members.get(row.message.conversationId) ?? [],
        receiptRows: receiptsByMessage.get(row.message.id) ?? [],
      }),
    );
  }

  async function publishReceipt(conversationId, userId, upToMessageId, state) {
    const memberIds = await conversationsRepository.listMemberIds(conversationId);
    events.publish('receipt.updated', { conversationId, userId, upToMessageId, state, memberIds });
  }

  const service = {
    serializeRows,

    async send(userId, conversationId, { clientId, body, attachmentId }) {
      await requireMember(conversationId, userId);

      const text = (body ?? '').trim();
      if (!text && !attachmentId) {
        throw validationFailed([{ path: 'body', message: 'Write a message or attach a file' }]);
      }
      if (text.length > MAX_BODY_LENGTH) {
        throw validationFailed([
          { path: 'body', message: `Messages can be at most ${MAX_BODY_LENGTH} characters` },
        ]);
      }

      if (attachmentId) {
        const attachment = await attachmentsRepository.findById(attachmentId);
        if (!attachment || attachment.uploaderId !== userId) {
          throw validationFailed([{ path: 'attachmentId', message: 'Unknown attachment' }]);
        }
      }

      let created;
      try {
        created = await messagesRepository.create({
          conversationId,
          senderId: userId,
          clientId,
          body: text,
          attachmentId,
        });
      } catch (err) {
        if (
          attachmentId &&
          /UNIQUE constraint failed: messages\.attachment_id/.test(
            String(err.cause?.message ?? err.message),
          )
        ) {
          throw conflict('ATTACHMENT_IN_USE', 'That attachment was already sent');
        }
        throw err;
      }

      const [message] = await serializeRows([created]);
      if (created.duplicate) {
        return { message, duplicate: true };
      }

      const memberIds = await conversationsRepository.listMemberIds(conversationId);
      events.publish('message.created', { message, memberIds });

      // Replying proves the sender has seen everything before it.
      const read = await messagesRepository.markRead(
        userId,
        conversationId,
        message.id,
        now().getTime(),
      );
      if (read?.receiptsChanged) {
        events.publish('receipt.updated', {
          conversationId,
          userId,
          upToMessageId: read.effective,
          state: 'read',
          memberIds,
        });
      }
      return { message, duplicate: false };
    },

    /** History, oldest first within the page. cursor is "createdAtMs.id" of the oldest held. */
    async list(userId, conversationId, { before, limit = DEFAULT_PAGE_SIZE }) {
      await requireMember(conversationId, userId);
      const rows = await messagesRepository.listBefore(conversationId, {
        cursor: before,
        limit,
      });
      const hasMore = rows.length > limit;
      const page = rows.slice(0, limit).reverse();
      const messages = await serializeRows(page);

      const incoming = page.filter((row) => row.message.senderId !== userId);
      if (incoming.length > 0) {
        const newest = Math.max(...incoming.map((row) => row.message.id));
        await service.markDelivered(userId, conversationId, newest);
      }

      const oldest = page[0]?.message;
      return {
        messages,
        hasMore,
        nextCursor: hasMore && oldest ? `${oldest.createdAt.getTime()}.${oldest.id}` : null,
      };
    },

    /** Catch-up after a reconnect: everything newer than afterId across the user's chats. */
    async sync(userId, { afterId, limit = SYNC_PAGE_SIZE }) {
      const rows = await messagesRepository.listAfterForUser(userId, { afterId, limit });
      const hasMore = rows.length > limit;
      const page = rows.slice(0, limit);
      const messages = await serializeRows(page);

      const newestByConversation = new Map();
      for (const { message } of page) {
        if (message.senderId !== userId) {
          const current = newestByConversation.get(message.conversationId) ?? 0;
          newestByConversation.set(message.conversationId, Math.max(current, message.id));
        }
      }
      for (const [conversationId, newest] of newestByConversation) {
        await service.markDelivered(userId, conversationId, newest);
      }
      return { messages, hasMore };
    },

    async edit(userId, messageId, body) {
      const row = await findForMember(messageId, userId);
      assertSender(row, userId);
      const text = body.trim();
      if (!text && !row.attachment) {
        throw validationFailed([{ path: 'body', message: 'A message cannot be empty' }]);
      }
      if (text.length > MAX_BODY_LENGTH) {
        throw validationFailed([
          { path: 'body', message: `Messages can be at most ${MAX_BODY_LENGTH} characters` },
        ]);
      }
      const updated = await messagesRepository.updateBody(messageId, userId, text, now());
      if (!updated) {
        throw conflict('MESSAGE_DELETED', 'This message was deleted');
      }
      const fresh = await messagesRepository.findById(messageId);
      const [message] = await serializeRows([fresh]);
      const memberIds = await conversationsRepository.listMemberIds(row.message.conversationId);
      events.publish('message.updated', { message, memberIds });
      return message;
    },

    async remove(userId, messageId) {
      const row = await findForMember(messageId, userId);
      assertSender(row, userId, { allowDeleted: true });
      const result = await messagesRepository.softDelete(messageId, userId, now());
      if (!result) {
        return; // Already deleted: deleting twice is not an error.
      }
      if (result.attachmentId) {
        await attachmentsService.discard(result.attachmentId).catch((err) => {
          logger.warn({ err, attachmentId: result.attachmentId }, 'failed to discard attachment');
        });
      }
      const memberIds = await conversationsRepository.listMemberIds(row.message.conversationId);
      events.publish('message.deleted', {
        conversationId: row.message.conversationId,
        messageId,
        memberIds,
      });
    },

    /** Mark up to a message (default: the newest) as read. Returns the remaining unread count. */
    async markRead(userId, conversationId, upToMessageId) {
      await requireMember(conversationId, userId);
      const target = upToMessageId ?? (await messagesRepository.latestId(conversationId));
      if (target !== null && target !== undefined) {
        const result = await messagesRepository.markRead(
          userId,
          conversationId,
          target,
          now().getTime(),
        );
        if (result && (result.advanced || result.receiptsChanged)) {
          await publishReceipt(conversationId, userId, result.effective, 'read');
        }
      }
      return { unreadCount: await conversationsRepository.unreadCount(conversationId, userId) };
    },

    /** Record delivery to userId. Callers have already proven membership. */
    async markDelivered(userId, conversationId, upToMessageId) {
      const changed = await messagesRepository.markDelivered(
        userId,
        conversationId,
        upToMessageId,
        now().getTime(),
      );
      if (changed !== null) {
        await publishReceipt(conversationId, userId, changed, 'delivered');
      }
    },
  };

  async function findForMember(messageId, userId) {
    const row = await messagesRepository.findById(messageId);
    if (!row) {
      throw notFound('Message not found');
    }
    const member = await conversationsRepository.findMember(row.message.conversationId, userId);
    if (!member) {
      throw notFound('Message not found');
    }
    return row;
  }

  function assertSender(row, userId, { allowDeleted = false } = {}) {
    if (row.message.senderId !== userId) {
      throw forbidden('NOT_MESSAGE_AUTHOR', 'You can only change your own messages');
    }
    if (row.message.deletedAt && !allowDeleted) {
      throw new AppError(409, 'MESSAGE_DELETED', 'This message was deleted');
    }
  }

  return service;
}
