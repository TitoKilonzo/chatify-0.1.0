import { AppError, conflict, forbidden, notFound, validationFailed } from '../../utils/errors.js';
import { randomUUID } from 'node:crypto';
import { toMessage, toReplyPreview } from './messages.serializer.js';
import { isReactionKey } from './reactions.js';

export const MAX_BODY_LENGTH = 4000;
// Ciphertext is larger than the text it hides (base64 plus a nonce and tag).
export const MAX_ENCRYPTED_BODY_LENGTH = 8000;
export const ENCRYPTED_PREFIX = 'e2ee:v1:';
export const DEFAULT_PAGE_SIZE = 40;
export const SYNC_PAGE_SIZE = 200;
export const MAX_PINS = 10;
export const MAX_FORWARD_TARGETS = 5;
export const SEARCH_PAGE_SIZE = 30;
export const MIN_SEARCH_LENGTH = 2;

/** Escape LIKE wildcards so the term is matched literally. */
export function likePattern(term) {
  return `%${term.replace(/[\\%_]/g, (char) => `\\${char}`)}%`;
}

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
    const replyIds = [
      ...new Set(rows.map((row) => row.message.replyToId).filter((id) => id !== null)),
    ];
    const [members, receipts, reactions, replied, threads] = await Promise.all([
      conversationsRepository.listMemberIdsFor(conversationIds),
      messagesRepository.receiptsFor(rows.map((row) => row.message.id)),
      messagesRepository.reactionsFor(rows.map((row) => row.message.id)),
      messagesRepository.findManyByIds(replyIds),
      messagesRepository.threadStats(
        rows.filter((row) => !row.message.threadRootId).map((row) => row.message.id),
      ),
    ]);
    const reactionsByMessage = new Map();
    for (const reaction of reactions) {
      const list = reactionsByMessage.get(reaction.messageId) ?? [];
      list.push(reaction);
      reactionsByMessage.set(reaction.messageId, list);
    }
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
        reactionRows: reactionsByMessage.get(row.message.id) ?? [],
        replyTo: toReplyPreview(replied.get(row.message.replyToId)),
        thread: threads.get(row.message.id) ?? null,
      }),
    );
  }

  async function publishReceipt(conversationId, userId, upToMessageId, state) {
    const memberIds = await conversationsRepository.listMemberIds(conversationId);
    events.publish('receipt.updated', { conversationId, userId, upToMessageId, state, memberIds });
  }

  const service = {
    serializeRows,

    async send(
      userId,
      conversationId,
      { clientId, body, attachmentId, replyToId, threadRootId, forwarded },
    ) {
      await requireMember(conversationId, userId);
      const conversation = await conversationsRepository.findById(conversationId);
      const ttl = conversation?.disappearAfterSeconds;
      const expiresAt = ttl ? new Date(now().getTime() + ttl * 1000) : null;

      const text = (body ?? '').trim();
      if (!text && !attachmentId) {
        throw validationFailed([{ path: 'body', message: 'Write a message or attach a file' }]);
      }
      const encrypted = Boolean(conversation?.encrypted);
      if (encrypted) {
        if (!text.startsWith(ENCRYPTED_PREFIX) || text.length > MAX_ENCRYPTED_BODY_LENGTH) {
          throw validationFailed([
            { path: 'body', message: 'This conversation is end-to-end encrypted' },
          ]);
        }
        if (attachmentId) {
          throw validationFailed([
            { path: 'attachmentId', message: 'Files are not sent in encrypted conversations yet' },
          ]);
        }
      } else if (text.length > MAX_BODY_LENGTH) {
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

      if (replyToId) {
        const target = await messagesRepository.findById(replyToId);
        if (!target || target.message.conversationId !== conversationId) {
          throw validationFailed([{ path: 'replyToId', message: 'Unknown message to reply to' }]);
        }
        if (target.message.deletedAt) {
          throw validationFailed([{ path: 'replyToId', message: 'That message was deleted' }]);
        }
      }

      if (threadRootId) {
        if (conversation?.type !== 'group') {
          throw validationFailed([
            { path: 'threadRootId', message: 'Threads are available in groups' },
          ]);
        }
        const root = await messagesRepository.findById(threadRootId);
        if (!root || root.message.conversationId !== conversationId || root.message.threadRootId) {
          throw validationFailed([{ path: 'threadRootId', message: 'Unknown thread' }]);
        }
        if (root.message.deletedAt) {
          throw validationFailed([{ path: 'threadRootId', message: 'That message was deleted' }]);
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
          replyToId,
          forwarded,
          expiresAt,
          threadRootId,
          encrypted,
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
      if (threadRootId) {
        // The root now shows a new reply count.
        await publishUpdate(threadRootId, conversationId);
      }

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
      if (row.message.encrypted) {
        if (!text.startsWith(ENCRYPTED_PREFIX) || text.length > MAX_ENCRYPTED_BODY_LENGTH) {
          throw validationFailed([
            { path: 'body', message: 'This message is end-to-end encrypted' },
          ]);
        }
      } else if (text.length > MAX_BODY_LENGTH) {
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

    /** Set or replace the caller's reaction. key must be one of the fixed icon keys. */
    async react(userId, messageId, key) {
      if (!isReactionKey(key)) {
        throw validationFailed([{ path: 'key', message: 'Unknown reaction' }]);
      }
      const row = await findForMember(messageId, userId);
      if (row.message.deletedAt) {
        throw new AppError(409, 'MESSAGE_DELETED', 'This message was deleted');
      }
      await messagesRepository.setReaction(messageId, userId, key, now());
      return publishUpdate(messageId, row.message.conversationId);
    },

    async unreact(userId, messageId) {
      const row = await findForMember(messageId, userId);
      await messagesRepository.clearReaction(messageId, userId);
      return publishUpdate(messageId, row.message.conversationId);
    },

    /** Pin a message. In direct chats any member can pin; in groups only owners and admins. */
    async pin(userId, messageId) {
      const row = await findForMember(messageId, userId);
      await requirePinRights(row.message.conversationId, userId);
      if (row.message.deletedAt) {
        throw new AppError(409, 'MESSAGE_DELETED', 'This message was deleted');
      }
      if (row.message.pinnedAt) {
        return serializeRows([row]).then(([message]) => message);
      }
      if ((await messagesRepository.countPinned(row.message.conversationId)) >= MAX_PINS) {
        throw conflict('PIN_LIMIT', `A conversation can have at most ${MAX_PINS} pinned messages`);
      }
      await messagesRepository.setPinned(messageId, now(), userId);
      return publishUpdate(messageId, row.message.conversationId);
    },

    async unpin(userId, messageId) {
      const row = await findForMember(messageId, userId);
      await requirePinRights(row.message.conversationId, userId);
      await messagesRepository.setPinned(messageId, null, null);
      return publishUpdate(messageId, row.message.conversationId);
    },

    async listPins(userId, conversationId) {
      await requireMember(conversationId, userId);
      return serializeRows(await messagesRepository.listPinned(conversationId));
    },

    /**
     * Send a copy of a message (and its file) to up to five other conversations the caller belongs
     * to. Every target is checked before anything is sent.
     */
    /**
     * Remove messages whose disappearing-message time is up, with their files, and tell the
     * members. Run on a timer; returns how many were removed.
     */
    async expireDue(limit = 200) {
      const due = await messagesRepository.listExpired(now(), limit);
      if (due.length === 0) {
        return 0;
      }
      await messagesRepository.deleteMany(due.map((row) => row.message.id));
      const byConversation = new Map();
      for (const row of due) {
        const list = byConversation.get(row.message.conversationId) ?? [];
        list.push(row.message.id);
        byConversation.set(row.message.conversationId, list);
        if (row.attachment) {
          await attachmentsService.discard(row.attachment.id);
        }
      }
      for (const [conversationId, messageIds] of byConversation) {
        const memberIds = await conversationsRepository.listMemberIds(conversationId);
        events.publish('message.expired', { conversationId, messageIds, memberIds });
      }
      return due.length;
    },

    async forward(userId, messageId, conversationIds) {
      const source = await findForMember(messageId, userId);
      if (source.message.deletedAt) {
        throw new AppError(409, 'MESSAGE_DELETED', 'This message was deleted');
      }
      if (source.message.encrypted) {
        throw conflict('ENCRYPTED_MESSAGE', 'Encrypted messages cannot be forwarded');
      }
      const targets = [...new Set(conversationIds)].slice(0, MAX_FORWARD_TARGETS);
      for (const conversationId of targets) {
        await requireMember(conversationId, userId);
      }
      const sent = [];
      for (const conversationId of targets) {
        let attachmentId;
        if (source.attachment) {
          attachmentId = (await attachmentsService.duplicate(source.attachment.id, userId)).id;
        }
        const result = await service.send(userId, conversationId, {
          clientId: `fwd-${randomUUID()}`,
          body: source.message.body,
          attachmentId,
          forwarded: true,
        });
        sent.push(result.message);
      }
      return sent;
    },

    /** The root message and one page of its replies, for the thread panel. */
    async thread(userId, messageId, { afterId = 0, limit = DEFAULT_PAGE_SIZE } = {}) {
      const rootRow = await findForMember(messageId, userId);
      if (rootRow.message.threadRootId) {
        throw notFound('Message not found');
      }
      const rows = await messagesRepository.listThread(messageId, { afterId, limit });
      const hasMore = rows.length > limit;
      const page = rows.slice(0, limit);
      const [root, ...replies] = await serializeRows([rootRow, ...page]);
      return { root, messages: replies, hasMore };
    },

    /** Find messages containing a term in the caller's conversations, newest first. */
    async search(userId, { q, conversationId, before, limit = SEARCH_PAGE_SIZE }) {
      const term = q.trim();
      if (term.length < MIN_SEARCH_LENGTH) {
        throw validationFailed([
          { path: 'q', message: `Type at least ${MIN_SEARCH_LENGTH} characters` },
        ]);
      }
      if (conversationId) {
        await requireMember(conversationId, userId);
      }
      const rows = await messagesRepository.search(userId, likePattern(term), {
        conversationId,
        beforeId: before,
        limit,
      });
      const hasMore = rows.length > limit;
      const page = rows.slice(0, limit);
      return {
        messages: await serializeRows(page),
        hasMore,
        nextBefore: hasMore ? page[page.length - 1].message.id : null,
      };
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

  /** Re-serialize one message and tell every member, so reactions and pins stay in step. */
  async function publishUpdate(messageId, conversationId) {
    const fresh = await messagesRepository.findById(messageId);
    const [message] = await serializeRows([fresh]);
    const memberIds = await conversationsRepository.listMemberIds(conversationId);
    events.publish('message.updated', { message, memberIds });
    return message;
  }

  async function requirePinRights(conversationId, userId) {
    const member = await conversationsRepository.findMember(conversationId, userId);
    const conversation = await conversationsRepository.findById(conversationId);
    if (conversation.type === 'group' && member.role === 'member') {
      throw forbidden('NOT_GROUP_ADMIN', 'Only group admins can pin messages');
    }
  }

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
