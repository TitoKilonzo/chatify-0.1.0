/*
 * Pure helpers for the per-conversation message list. Messages are kept oldest first and keyed by
 * server id. A message that is still being sent has no server id: it lives under its clientId with
 * pending: true until the acknowledgement (or a realtime copy) replaces it.
 */

const STATE_RANK = { sent: 0, delivered: 1, read: 2 };

function timeOf(message) {
  return new Date(message.createdAt).getTime();
}

function idOf(message) {
  return typeof message.id === 'number' ? message.id : Number.MAX_SAFE_INTEGER;
}

export function compareMessages(a, b) {
  return timeOf(a) - timeOf(b) || idOf(a) - idOf(b);
}

/** A local copy of a message that has been submitted but not yet confirmed by the server. */
export function createPending({ clientId, conversationId, senderId, body, attachment = null }) {
  return {
    id: `pending:${clientId}`,
    clientId,
    conversationId,
    senderId,
    body,
    attachment,
    editedAt: null,
    deletedAt: null,
    createdAt: new Date().toISOString(),
    receipts: [],
    pending: true,
    failed: false,
  };
}

/**
 * Merge incoming server messages into an existing list. Duplicates (same id) are replaced by the
 * newer copy, and a pending message disappears once its confirmed twin (same clientId) arrives.
 * This is what makes reconnect sync and double delivery harmless.
 */
export function mergeMessages(existing, incoming) {
  const byId = new Map();
  for (const message of existing) {
    byId.set(message.id, message);
  }
  const confirmedClientIds = new Set(
    incoming.filter((message) => !message.pending).map((message) => message.clientId),
  );
  for (const message of incoming) {
    byId.set(message.id, message);
  }
  for (const [id, message] of byId) {
    if (message.pending && confirmedClientIds.has(message.clientId)) {
      byId.delete(id);
    }
  }
  return [...byId.values()].sort(compareMessages);
}

export function replaceMessage(messages, message) {
  return mergeMessages(messages, [message]);
}

export function markDeleted(messages, messageId, deletedAt = new Date().toISOString()) {
  return messages.map((message) =>
    message.id === messageId
      ? { ...message, body: '', attachment: null, deletedAt, receipts: message.receipts }
      : message,
  );
}

/**
 * Apply "userId has reached state up to upToMessageId". States only move forward, and a user's
 * receipt never applies to their own messages.
 */
export function applyReceipt(messages, { userId, upToMessageId, state }) {
  let changed = false;
  const next = messages.map((message) => {
    if (
      typeof message.id !== 'number' ||
      message.id > upToMessageId ||
      message.senderId === userId
    ) {
      return message;
    }
    const receipts = message.receipts.map((receipt) => {
      if (receipt.userId === userId && STATE_RANK[receipt.state] < STATE_RANK[state]) {
        changed = true;
        return { ...receipt, state };
      }
      return receipt;
    });
    return receipts === message.receipts ? message : { ...message, receipts };
  });
  return changed ? next : messages;
}

/**
 * One status for the sender's own message: sending, failed, or the weakest receipt across all
 * recipients (a group message is "read" only when everyone has read it).
 */
export function messageStatus(message) {
  if (message.pending) {
    return message.failed ? 'failed' : 'sending';
  }
  if (message.receipts.length === 0) {
    return 'sent';
  }
  const weakest = Math.min(...message.receipts.map((receipt) => STATE_RANK[receipt.state]));
  return Object.keys(STATE_RANK).find((state) => STATE_RANK[state] === weakest);
}

/** For tooltips: how many recipients have reached the given state or better. */
export function countAtLeast(message, state) {
  return message.receipts.filter((receipt) => STATE_RANK[receipt.state] >= STATE_RANK[state])
    .length;
}

/** Whether to show a day heading above message at index. */
export function startsNewDay(messages, index) {
  if (index === 0) {
    return true;
  }
  const a = new Date(messages[index - 1].createdAt);
  const b = new Date(messages[index].createdAt);
  return a.toDateString() !== b.toDateString();
}

const GROUP_WINDOW_MS = 5 * 60 * 1000;

/** Whether message at index continues a run from the same sender, so the name can be omitted. */
export function continuesRun(messages, index) {
  if (index === 0 || startsNewDay(messages, index)) {
    return false;
  }
  const previous = messages[index - 1];
  const current = messages[index];
  return (
    previous.senderId === current.senderId && timeOf(current) - timeOf(previous) < GROUP_WINDOW_MS
  );
}
