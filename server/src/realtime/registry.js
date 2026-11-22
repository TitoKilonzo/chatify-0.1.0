/**
 * Tracks live sockets per user. Realtime fan-out goes through this registry (not Socket.io rooms)
 * so each delivery can use a per-socket acknowledgement, which is what drives "delivered".
 */
export function createRegistry() {
  const sockets = new Map();

  return {
    add(userId, socket) {
      const set = sockets.get(userId) ?? new Set();
      set.add(socket);
      sockets.set(userId, set);
    },
    remove(userId, socket) {
      const set = sockets.get(userId);
      if (!set) {
        return;
      }
      set.delete(socket);
      if (set.size === 0) {
        sockets.delete(userId);
      }
    },
    forUser(userId) {
      return sockets.get(userId) ?? new Set();
    },
    count(userId) {
      return sockets.get(userId)?.size ?? 0;
    },
    isOnline(userId) {
      return this.count(userId) > 0;
    },
  };
}
