import { ApiError, api } from '../../lib/api.js';
import { applyIncomingMessage } from '../../lib/conversation-cache.js';
import { createPending } from '../../lib/message-cache.js';
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
async function transmit(pending) {
  const { conversationId, clientId, body, attachment } = pending;
  const payload = { clientId, body, attachmentId: attachment?.id };

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
    patchConversationList((list) =>
      applyIncomingMessage(list, result.message, { meId: pending.senderId, isViewing: true }),
    );
  } catch {
    store().setPendingFailed(conversationId, clientId, true);
  }
}

export async function sendMessage({ conversationId, senderId, body, attachment = null }) {
  const clientId = crypto.randomUUID();
  const pending = createPending({ clientId, conversationId, senderId, body, attachment });
  store().addPending(pending);
  await transmit(pending);
}

export async function retryMessage(message) {
  store().setPendingFailed(message.conversationId, message.clientId, false);
  await transmit(message);
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
