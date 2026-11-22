/**
 * Online/offline tracking. A user is online while at least one socket is open. Going offline is
 * delayed by a grace period so a page reload or brief network drop does not flicker the status
 * for everyone who shares a conversation with them.
 */
export function createPresence({
  usersRepository,
  conversationsRepository,
  registry,
  emitToUsers,
  logger,
  graceMs = 5000,
  now = () => new Date(),
}) {
  const online = new Set();
  const timers = new Map();

  async function broadcast(userId, status, lastSeenAt) {
    const peers = await conversationsRepository.listPeerIds(userId);
    emitToUsers([userId, ...peers], 'presence:update', { userId, status, lastSeenAt });
  }

  async function goOffline(userId) {
    timers.delete(userId);
    if (registry.isOnline(userId) || !online.has(userId)) {
      return;
    }
    online.delete(userId);
    const lastSeenAt = now();
    await usersRepository.setPresence(userId, 'offline', lastSeenAt);
    await broadcast(userId, 'offline', lastSeenAt);
  }

  return {
    async connected(userId) {
      const pending = timers.get(userId);
      if (pending) {
        clearTimeout(pending);
        timers.delete(userId);
      }
      if (online.has(userId)) {
        return;
      }
      online.add(userId);
      await usersRepository.setPresence(userId, 'online', null);
      await broadcast(userId, 'online', null);
    },

    disconnected(userId) {
      if (registry.isOnline(userId) || !online.has(userId) || timers.has(userId)) {
        return;
      }
      const timer = setTimeout(() => {
        goOffline(userId).catch((err) => logger.error({ err, userId }, 'presence update failed'));
      }, graceMs);
      timer.unref?.();
      timers.set(userId, timer);
    },

    stop() {
      for (const timer of timers.values()) {
        clearTimeout(timer);
      }
      timers.clear();
    },
  };
}
