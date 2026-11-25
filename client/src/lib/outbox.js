/*
 * Persistent outbox for messages that could not be delivered yet (offline, server restarting).
 * Entries survive a reload or a closed tab and are sent again when the app is next connected.
 * Sends are idempotent on the server (clientId), so resending an entry that actually arrived is
 * harmless. Entries are stored per user and removed on explicit sign-out.
 */

const PREFIX = 'chatify:outbox:';
export const MAX_ENTRIES = 100;
export const MAX_AGE_MS = 3 * 24 * 60 * 60 * 1000;

const keyFor = (userId) => `${PREFIX}${userId}`;

function defaultStorage() {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    // Access itself can throw when site data is blocked.
    return null;
  }
}

function isValid(entry, now) {
  return (
    entry &&
    typeof entry.clientId === 'string' &&
    typeof entry.conversationId === 'string' &&
    typeof entry.body === 'string' &&
    typeof entry.createdAt === 'number' &&
    now - entry.createdAt <= MAX_AGE_MS &&
    (entry.attachment === null || (entry.attachment && typeof entry.attachment.id === 'string'))
  );
}

function write(storage, userId, entries) {
  try {
    if (entries.length === 0) {
      storage.removeItem(keyFor(userId));
    } else {
      storage.setItem(keyFor(userId), JSON.stringify(entries));
    }
  } catch {
    // Quota or blocked storage: the in-memory pending message still works for this session.
  }
}

/** All valid, unexpired entries for a user, oldest first. */
export function loadOutbox(userId, { storage = defaultStorage(), now = Date.now() } = {}) {
  if (!storage || !userId) {
    return [];
  }
  try {
    const parsed = JSON.parse(storage.getItem(keyFor(userId)) ?? '[]');
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed.filter((entry) => isValid(entry, now)).sort((a, b) => a.createdAt - b.createdAt);
  } catch {
    return [];
  }
}

export function addToOutbox(userId, entry, { storage = defaultStorage(), now = Date.now() } = {}) {
  if (!storage || !userId) {
    return;
  }
  const kept = loadOutbox(userId, { storage, now }).filter((e) => e.clientId !== entry.clientId);
  kept.push({
    clientId: entry.clientId,
    conversationId: entry.conversationId,
    body: entry.body,
    attachment: entry.attachment ?? null,
    replyTo: entry.replyTo ?? null,
    threadRootId: entry.threadRootId ?? null,
    createdAt: entry.createdAt ?? now,
  });
  write(storage, userId, kept.slice(-MAX_ENTRIES));
}

export function removeFromOutbox(userId, clientId, { storage = defaultStorage() } = {}) {
  if (!storage || !userId) {
    return;
  }
  const kept = loadOutbox(userId, { storage }).filter((entry) => entry.clientId !== clientId);
  write(storage, userId, kept);
}

export function clearOutbox(userId, { storage = defaultStorage() } = {}) {
  if (!storage || !userId) {
    return;
  }
  write(storage, userId, []);
}

/** A rejection that retrying cannot fix (validation, permissions), as opposed to a network fault. */
export function isPermanentFailure(error) {
  const status = error?.status;
  return (
    typeof status === 'number' &&
    status >= 400 &&
    status < 500 &&
    status !== 408 &&
    status !== 429 &&
    status !== 401
  );
}
