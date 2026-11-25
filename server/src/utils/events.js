import { EventEmitter } from 'node:events';

/**
 * In-process event bus that decouples business services from the realtime transport.
 * Services publish facts ("message.created"); the realtime layer subscribes and fans them out.
 * A failing subscriber never breaks the publisher: errors are reported to onError.
 *
 * Events:
 * - message.created   { message, memberIds }
 * - message.updated   { message, memberIds }
 * - message.deleted   { conversationId, messageId, memberIds }
 * - message.expired   { conversationId, messageIds, memberIds }
 * - receipt.updated   { conversationId, userId, upToMessageId, state, memberIds }
 * - conversation.changed { conversationId, userIds, addedUserIds, removedUserIds, reason }
 * - user.updated      { userId }
 * - user.sessions-revoked { userId }
 */
export function createEventBus({ onError = () => {} } = {}) {
  const emitter = new EventEmitter();
  emitter.setMaxListeners(50);

  return {
    publish(event, payload) {
      for (const listener of emitter.listeners(event)) {
        try {
          const result = listener(payload);
          if (result && typeof result.catch === 'function') {
            result.catch((err) => onError(err, event));
          }
        } catch (err) {
          onError(err, event);
        }
      }
    },
    subscribe(event, listener) {
      emitter.on(event, listener);
      return () => emitter.off(event, listener);
    },
  };
}
