const TYPING_TTL_MS = 3000;

/**
 * Server-side typing state. A "typing" signal expires on its own after a few seconds, so a client
 * that vanishes mid-sentence never leaves a stuck indicator on other people's screens.
 */
export function createTyping({ broadcast, ttlMs = TYPING_TTL_MS }) {
  const active = new Map();

  function keyOf(conversationId, userId) {
    return `${conversationId}:${userId}`;
  }

  function stop(conversationId, userId) {
    const key = keyOf(conversationId, userId);
    const entry = active.get(key);
    if (!entry) {
      return;
    }
    clearTimeout(entry);
    active.delete(key);
    broadcast(conversationId, userId, false);
  }

  return {
    start(conversationId, userId) {
      const key = keyOf(conversationId, userId);
      const existing = active.get(key);
      if (existing) {
        clearTimeout(existing);
      } else {
        broadcast(conversationId, userId, true);
      }
      const timer = setTimeout(() => stop(conversationId, userId), ttlMs);
      timer.unref?.();
      active.set(key, timer);
    },
    stop,
    stopAllForUser(userId) {
      for (const key of [...active.keys()]) {
        if (key.endsWith(`:${userId}`)) {
          const [conversationId] = key.split(':');
          stop(conversationId, userId);
        }
      }
    },
    clear() {
      for (const timer of active.values()) {
        clearTimeout(timer);
      }
      active.clear();
    },
  };
}
