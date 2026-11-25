import { ApiError, api } from '../../lib/api.js';
import { rememberPlain } from '../../lib/e2eeSession.js';
import { applyIncomingMessage } from '../../lib/conversation-cache.js';
import { createPending } from '../../lib/message-cache.js';
import { addToOutbox, isPermanentFailure, loadOutbox, removeFromOutbox } from '../../lib/outbox.js';
import { queryClient } from '../../lib/queryClient.js';
import { getSocket } from '../../lib/socket.js';
import { useMessageStore } from '../../stores/messageStore.js';
import { conversationsKey } from './useConversations.js';

const PAGE_SIZE = 40;
const ACK_TIMEOUT_MS = 8000;
const SYNC_LIMIT_PAGES = 10;

const store = () => useMessageStore.getState();

/** Update the cached conversation list in place; null result means "refetch it". */
export function patchConversationList(updater) {
  const current = queryClient.getQueryData(conversationsKey);
  if (!current) {
    return;
  }
  const next = updater(current);
  if (next === null) {
    queryClient.invalidateQueries({ queryKey: conversationsKey });
  } else {
    queryClient.setQueryData(conversationsKey, next);
  }
}

export async function loadLatest(conversationId) {
  const state = store();
  state.setLoading(conversationId, true);
  try {
    const data = await api.get(`/conversations/${conversationId}/messages?limit=${PAGE_SIZE}`);
    store().setLatest(conversationId, data);
  } catch (error) {
    store().setError(conversationId, error);
  }
}

export async function loadOlder(conversationId) {
  const current = store().byConversation[conversationId];
  if (!current || current.loading || !current.hasMore || !current.nextCursor) {
    return;
  }
  store().setLoading(conversationId, true);
  try {
    const data = await api.get(
      `/conversations/${conversationId}/messages?limit=${PAGE_SIZE}&before=${current.nextCursor}`,
    );
    store().prependOlder(conversationId, data);
  } catch (error) {
    store().setError(conversationId, error);
  }
}

/**
 * Send over the socket when connected, otherwise (or if the ack never arrives) over HTTP. Both
 * carry the same clientId, so a retry after a lost acknowledgement cannot create a duplicate.
 */
const inflight = new Set();

/**
 * tracked is false for messages restored from the outbox into a conversation that is not open:
 * they have no pending bubble to mark as failed and simply stay in the outbox for the next try.
 */
async function transmit(pending, { tracked = true } = {}) {
  const { conversationId, clientId, body, attachment, replyTo, threadRootId } = pending;
  const payload = {
    clientId,
    body,
    attachmentId: attachment?.id,
    replyToId: replyTo?.id,
    threadRootId: threadRootId ?? undefined,
  };
  if (inflight.has(clientId)) {
    return;
  }
  inflight.add(clientId);

  try {
    let result = null;
    const socket = getSocket();
    if (socket?.connected) {
      try {
        result = await socket
          .timeout(ACK_TIMEOUT_MS)
          .emitWithAck('message:send', { conversationId, ...payload });
      } catch {
        result = null;
      }
    }
    if (!result) {
      const data = await api.post(`/conversations/${conversationId}/messages`, payload);
      result = { ok: true, message: data.message };
    }
    if (!result.ok) {
      throw new ApiError({ status: 400, ...result.error });
    }
    store().upsert(result.message);
    removeFromOutbox(pending.senderId, clientId);
    patchConversationList((list) =>
      applyIncomingMessage(list, result.message, { meId: pending.senderId, isViewing: true }),
    );
  } catch (error) {
    if (tracked) {
      store().setPendingFailed(conversationId, clientId, true);
    }
    if (isPermanentFailure(error)) {
      // Retrying cannot succeed (for example the user left the group); do not resend forever.
      removeFromOutbox(pending.senderId, clientId);
    }
  } finally {
    inflight.delete(clientId);
  }
}

export async function sendMessage({
  conversationId,
  senderId,
  body,
  attachment = null,
  replyTo = null,
  threadRootId = null,
  plain = null,
}) {
  const clientId = crypto.randomUUID();
  // For an encrypted chat body is already ciphertext; the readable text stays in memory only.
  if (plain !== null) {
    rememberPlain(clientId, plain);
  }
  const pending = createPending({
    clientId,
    conversationId,
    senderId,
    body,
    attachment,
    replyTo,
    threadRootId,
    encrypted: plain !== null,
  });
  store().addPending(pending);
  // Written before the first attempt so a reload or closed tab cannot lose the message.
  addToOutbox(senderId, {
    clientId,
    conversationId,
    body,
    attachment,
    replyTo,
    threadRootId,
  });
  await transmit(pending);
}

export async function retryMessage(message) {
  store().setPendingFailed(message.conversationId, message.clientId, false);
  addToOutbox(message.senderId, message);
  await transmit(message);
}

function isInStore(clientId) {
  return Object.values(store().byConversation).some((conversation) =>
    conversation.messages.some((message) => message.clientId === clientId),
  );
}

/**
 * Send what is waiting in the outbox. Entries that still have a bubble on screen are handled by
 * retryAllFailed; the rest (left over from a reload or a closed tab) are sent directly, and
 * appear in their conversation through the normal sync when it is opened.
 */
export function flushOutbox(userId) {
  for (const entry of loadOutbox(userId)) {
    if (inflight.has(entry.clientId) || isInStore(entry.clientId)) {
      continue;
    }
    transmit(
      createPending({
        clientId: entry.clientId,
        conversationId: entry.conversationId,
        senderId: userId,
        body: entry.body,
        attachment: entry.attachment,
        replyTo: entry.replyTo,
        threadRootId: entry.threadRootId,
      }),
      { tracked: false },
    );
  }
}

/** After a reconnect, resend anything that failed while offline. Safe: sends are idempotent. */
export function retryAllFailed() {
  for (const conversation of Object.values(store().byConversation)) {
    for (const message of conversation.messages) {
      if (message.pending && message.failed) {
        retryMessage(message);
      }
    }
  }
}

export function discardFailed(message) {
  removeFromOutbox(message.senderId, message.clientId);
  store().removePending(message.conversationId, message.clientId);
}

export async function editMessage(messageId, body) {
  const data = await api.patch(`/messages/${messageId}`, { body });
  store().upsert(data.message);
}

export async function deleteMessage(message) {
  await api.delete(`/messages/${message.id}`);
  store().deleted(message.conversationId, message.id);
}

const lastMarked = new Map();

/** Tell the server the user has read up to a message, and zero the badge right away. */
export async function markRead(conversationId, upToMessageId) {
  if ((lastMarked.get(conversationId) ?? 0) >= upToMessageId) {
    return;
  }
  lastMarked.set(conversationId, upToMessageId);
  patchConversationList((list) =>
    list.map((conversation) =>
      conversation.id === conversationId && (conversation.lastMessage?.id ?? 0) <= upToMessageId
        ? { ...conversation, unreadCount: 0 }
        : conversation,
    ),
  );
  try {
    const socket = getSocket();
    let result = null;
    if (socket?.connected) {
      try {
        result = await socket
          .timeout(ACK_TIMEOUT_MS)
          .emitWithAck('message:read', { conversationId, upToMessageId });
      } catch {
        result = null;
      }
    }
    if (!result?.ok) {
      result = await api.post(`/conversations/${conversationId}/read`, { upToMessageId });
    }
    patchConversationList((list) =>
      list.map((conversation) =>
        conversation.id === conversationId
          ? { ...conversation, unreadCount: result.unreadCount }
          : conversation,
      ),
    );
  } catch {
    // Let the next attempt try again.
    lastMarked.delete(conversationId);
  }
}

export function resetMessageActions() {
  lastMarked.clear();
}

/**
 * Catch up after a reconnect: pull everything newer than the highest message id seen. Messages are
 * merged by id, so anything that also arrived live is not duplicated. The caller refetches the
 * conversation list afterwards, which restores unread counts and previews.
 */
export async function catchUp() {
  let afterId = store().maxId;
  if (afterId === 0) {
    return;
  }
  for (let page = 0; page < SYNC_LIMIT_PAGES; page += 1) {
    const data = await api.get(`/sync?afterId=${afterId}`);
    store().upsert(data.messages);
    if (!data.hasMore || data.messages.length === 0) {
      return;
    }
    afterId = data.messages[data.messages.length - 1].id;
  }
}

export async function reactToMessage(messageId, key) {
  const data = await api.put(`/messages/${messageId}/reaction`, { key });
  store().upsert(data.message);
}

export async function clearReaction(messageId) {
  const data = await api.delete(`/messages/${messageId}/reaction`);
  store().upsert(data.message);
}

export async function setPinned(messageId, pinned) {
  const data = pinned
    ? await api.put(`/messages/${messageId}/pin`)
    : await api.delete(`/messages/${messageId}/pin`);
  store().upsert(data.message);
}

/** Send a copy of a message to up to five other conversations. */
export async function forwardMessage(messageId, conversationIds) {
  const data = await api.post(`/messages/${messageId}/forward`, { conversationIds });
  store().upsert(data.messages);
  queryClient.invalidateQueries({ queryKey: conversationsKey });
  return data.messages;
}

/**
 * Page older messages until the given message is in the cache (or history runs out). Used to jump
 * to a search result or a pinned message that is further back than what is loaded.
 */
export async function loadUntil(conversationId, messageId, maxPages = 50) {
  const has = () =>
    store().byConversation[conversationId]?.messages.some((message) => message.id === messageId);
  for (let page = 0; page < maxPages && !has(); page += 1) {
    const current = store().byConversation[conversationId];
    if (!current?.loaded) {
      await loadLatest(conversationId);
      continue;
    }
    if (!current.hasMore || !current.nextCursor) {
      break;
    }
    await loadOlder(conversationId);
  }
  return Boolean(has());
}

/** Fetch a thread's root and replies into the cache (all pages). */
export async function loadThread(rootId) {
  let after = 0;
  for (let page = 0; page < 20; page += 1) {
    const data = await api.get(`/messages/${rootId}/thread?after=${after}&limit=100`);
    store().upsert([data.root, ...data.messages]);
    if (!data.hasMore || data.messages.length === 0) {
      return;
    }
    after = data.messages[data.messages.length - 1].id;
  }
}
