import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api.js';
import { applyIncomingMessage, conversationTitle } from '../../lib/conversation-cache.js';
import { closeSocket, openSocket } from '../../lib/socket.js';
import { useMessageStore } from '../../stores/messageStore.js';
import {
  useAnnouncerStore,
  useConnectionStore,
  usePresenceStore,
  useTypingStore,
} from '../../stores/liveStores.js';
import { sessionKey } from '../auth/useSession.js';
import {
  catchUp,
  flushOutbox,
  loadLatest,
  markRead,
  patchConversationList,
  resetMessageActions,
  retryAllFailed,
} from './messageActions.js';
import { conversationKey, conversationsKey } from './useConversations.js';
import { getViewing, isViewing } from './viewing.js';

const RECONNECT_BASE_MS = 1000;
const RECONNECT_MAX_MS = 15_000;

/**
 * Connects the socket for the signed-in user and keeps every cache current from server events.
 * Mounted once, inside the signed-in shell.
 *
 * Reconnect strategy: socket.io retries network drops by itself. When the server ends the session
 * (logout elsewhere, password change) or the access cookie expired, the handshake fails; we then
 * ask /auth/me, which refreshes the cookie or signs the UI out, and connect again with backoff.
 * After every connect we replay missed messages through /api/sync and refetch the inbox.
 */
export function useRealtime(meId) {
  const queryClient = useQueryClient();

  useEffect(() => {
    const socket = openSocket();
    const setStatus = useConnectionStore.getState().setStatus;
    const messages = () => useMessageStore.getState();
    let retryTimer = null;
    let attempts = 0;
    let stopped = false;
    let everConnected = false;

    function scheduleReconnect() {
      if (stopped) {
        return;
      }
      clearTimeout(retryTimer);
      const delay = Math.min(RECONNECT_BASE_MS * 2 ** attempts, RECONNECT_MAX_MS);
      attempts += 1;
      retryTimer = setTimeout(async () => {
        try {
          // Refreshes an expired access cookie, or signs out if the session is gone.
          await api.get('/auth/me');
          socket.connect();
        } catch {
          scheduleReconnect();
        }
      }, delay);
    }

    async function afterConnect() {
      try {
        await catchUp();
      } catch {
        // The refetches below still bring the visible state up to date.
      }
      queryClient.invalidateQueries({ queryKey: conversationsKey });
      const open = getViewing();
      if (open) {
        queryClient.invalidateQueries({ queryKey: conversationKey(open) });
        // Edits and deletions are not part of sync, so reload the newest page of the open chat.
        loadLatest(open);
      }
      retryAllFailed();
      flushOutbox(meId);
    }

    socket.on('connect', () => {
      attempts = 0;
      setStatus('connected');
      if (everConnected) {
        afterConnect();
      } else {
        everConnected = true;
        queryClient.invalidateQueries({ queryKey: conversationsKey });
        // Messages left over from a previous visit (offline, closed tab) go out now.
        flushOutbox(meId);
      }
    });

    socket.on('disconnect', (reason) => {
      setStatus('disconnected');
      if (reason === 'io server disconnect') {
        // The server dropped us on purpose; socket.io will not reconnect on its own.
        scheduleReconnect();
      }
    });

    socket.on('connect_error', () => {
      setStatus('disconnected');
      // Middleware rejections are final for socket.io, so reconnection is driven from here. Plain
      // network failures are retried by socket.io itself and do not reach this branch twice.
      if (!socket.active) {
        scheduleReconnect();
      }
    });

    socket.io.on('reconnect_attempt', () => setStatus('connecting'));

    socket.on('message:new', ({ message }, ack) => {
      // Acknowledging is what marks the message delivered for the sender.
      if (typeof ack === 'function') {
        ack();
      }
      messages().upsert(message);

      const viewing = isViewing(message.conversationId);
      patchConversationList((list) =>
        applyIncomingMessage(list, message, { meId, isViewing: viewing }),
      );

      if (message.senderId !== meId) {
        const list = queryClient.getQueryData(conversationsKey) ?? [];
        const conversation = list.find((item) => item.id === message.conversationId);
        const where = conversation ? conversationTitle(conversation) : 'a conversation';
        useAnnouncerStore.getState().announce(`New message in ${where}`);
        if (viewing) {
          markRead(message.conversationId, message.id);
        }
      }
    });

    socket.on('message:updated', ({ message }) => {
      messages().upsert(message);
      queryClient.invalidateQueries({ queryKey: conversationsKey });
    });

    socket.on('message:expired', ({ conversationId, messageIds }) => {
      messages().expire(conversationId, messageIds);
      queryClient.invalidateQueries({ queryKey: conversationsKey });
    });

    socket.on('message:deleted', ({ conversationId, messageId }) => {
      messages().deleted(conversationId, messageId);
      queryClient.invalidateQueries({ queryKey: conversationsKey });
    });

    socket.on('receipt:update', (receipt) => {
      messages().receipt(receipt.conversationId, receipt);
      if (receipt.userId === meId && receipt.state === 'read') {
        // Read in another tab or device: clear the badge here too.
        patchConversationList((list) =>
          list.map((conversation) =>
            conversation.id === receipt.conversationId &&
            (conversation.lastMessage?.id ?? 0) <= receipt.upToMessageId
              ? { ...conversation, unreadCount: 0 }
              : conversation,
          ),
        );
      }
    });

    socket.on('typing:update', (event) => useTypingStore.getState().set(event));
    socket.on('presence:update', (event) => usePresenceStore.getState().update(event));

    socket.on('conversation:changed', ({ conversationId, removed }) => {
      queryClient.invalidateQueries({ queryKey: conversationsKey });
      queryClient.invalidateQueries({ queryKey: conversationKey(conversationId) });
      if (removed) {
        messages().drop(conversationId);
      }
    });

    socket.on('user:updated', ({ userId }) => {
      queryClient.invalidateQueries({ queryKey: conversationsKey });
      queryClient.invalidateQueries({ queryKey: ['conversation'] });
      if (userId === meId) {
        queryClient.invalidateQueries({ queryKey: sessionKey });
      }
    });

    // The browser knows the network is back before socket.io's own retry fires.
    function handleOnline() {
      if (socket.connected) {
        retryAllFailed();
        flushOutbox(meId);
      }
    }
    window.addEventListener('online', handleOnline);

    setStatus('connecting');
    socket.connect();

    // Disappearing messages leave the screen on time, even if the server notice is delayed.
    const expiryTimer = setInterval(() => messages().dropExpired(), 5000);

    return () => {
      clearInterval(expiryTimer);
      window.removeEventListener('online', handleOnline);
      stopped = true;
      clearTimeout(retryTimer);
      closeSocket();
      resetMessageActions();
      useMessageStore.getState().reset();
      usePresenceStore.getState().reset();
      useTypingStore.getState().reset();
    };
  }, [meId, queryClient]);
}
