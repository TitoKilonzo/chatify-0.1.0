import { create } from 'zustand';

/** Socket connection state, shown as a banner while the app is not live. */
export const useConnectionStore = create((set) => ({
  status: 'connecting',
  setStatus: (status) => set({ status }),
}));

/**
 * Presence overrides received over the socket, keyed by user id. API payloads carry the status as
 * of fetch time; anything newer arrives here and wins.
 */
export const usePresenceStore = create((set) => ({
  byUser: {},
  update: ({ userId, status, lastSeenAt }) =>
    set((s) => ({ byUser: { ...s.byUser, [userId]: { status, lastSeenAt } } })),
  reset: () => set({ byUser: {} }),
}));

/** Resolve a user's effective presence from the live override and the fetched user object. */
export function effectivePresence(user, live) {
  const override = user ? live[user.id] : null;
  return {
    status: override?.status ?? user?.status ?? 'offline',
    lastSeenAt: override ? override.lastSeenAt : (user?.lastSeenAt ?? null),
  };
}

const TYPING_EXPIRY_MS = 4500;
const timers = new Map();

/**
 * Who is typing where. The server expires typing after 3 seconds; this client-side timer is a
 * safety net so a lost "stopped" event never leaves an indicator stuck.
 */
export const useTypingStore = create((set, get) => ({
  byConversation: {},

  set: ({ conversationId, userId, typing }) => {
    const key = `${conversationId}:${userId}`;
    clearTimeout(timers.get(key));
    timers.delete(key);

    const current = get().byConversation[conversationId] ?? [];
    const without = current.filter((id) => id !== userId);
    const next = typing ? [...without, userId] : without;
    set((s) => ({ byConversation: { ...s.byConversation, [conversationId]: next } }));

    if (typing) {
      timers.set(
        key,
        setTimeout(() => get().set({ conversationId, userId, typing: false }), TYPING_EXPIRY_MS),
      );
    }
  },

  reset: () => {
    timers.forEach(clearTimeout);
    timers.clear();
    set({ byConversation: {} });
  },
}));

/** Screen reader announcements. The Announcer component renders the latest text in a live region. */
export const useAnnouncerStore = create((set) => ({
  text: '',
  announce: (text) => set({ text }),
}));

/** Unsent composer text per conversation, so switching chats never loses a draft. */
export const useDraftStore = create((set) => ({
  drafts: {},
  setDraft: (conversationId, text) =>
    set((s) => {
      if (!text) {
        const { [conversationId]: _removed, ...rest } = s.drafts;
        return { drafts: rest };
      }
      return { drafts: { ...s.drafts, [conversationId]: text } };
    }),
}));

/** The message the user is replying to, per conversation. Cleared on send or cancel. */
export const useReplyStore = create((set) => ({
  byConversation: {},
  setReply: (conversationId, message) =>
    set((s) => {
      if (!message) {
        const { [conversationId]: _removed, ...rest } = s.byConversation;
        return { byConversation: rest };
      }
      return {
        byConversation: {
          ...s.byConversation,
          [conversationId]: {
            id: message.id,
            senderId: message.senderId,
            // Ciphertext is not quoted; the preview just says the message is encrypted.
            body: message.encrypted ? '' : message.body.slice(0, 140),
            encrypted: Boolean(message.encrypted),
            deleted: false,
            attachmentKind: message.attachment?.kind ?? null,
          },
        },
      };
    }),
}));
