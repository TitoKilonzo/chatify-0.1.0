import { create } from 'zustand';
import { applyReceipt, markDeleted, mergeMessages } from '../lib/message-cache.js';

// Virtuoso needs a large starting index so older pages can be prepended without negative indexes.
export const START_INDEX = 1_000_000;

const empty = () => ({
  messages: [],
  hasMore: true,
  nextCursor: null,
  loaded: false,
  loading: false,
  error: null,
  prependCount: 0,
});

function patch(state, conversationId, change) {
  const current = state.byConversation[conversationId] ?? empty();
  return {
    byConversation: {
      ...state.byConversation,
      [conversationId]: { ...current, ...change(current) },
    },
  };
}

/**
 * Client-side message cache, one entry per conversation, plus the highest server message id seen.
 * maxId is the cursor for GET /api/sync after a reconnect.
 */
export const useMessageStore = create((set) => ({
  byConversation: {},
  maxId: 0,

  setLoading: (id, loading) => set((s) => patch(s, id, () => ({ loading }))),
  setError: (id, error) => set((s) => patch(s, id, () => ({ error, loading: false }))),

  /** First page for a conversation (or a refresh of the newest page). */
  setLatest: (id, { messages, hasMore, nextCursor }) =>
    set((s) => ({
      ...patch(s, id, (current) => ({
        messages: current.loaded ? mergeMessages(current.messages, messages) : messages,
        hasMore: current.loaded ? current.hasMore && hasMore : hasMore,
        nextCursor: current.loaded && current.nextCursor ? current.nextCursor : nextCursor,
        loaded: true,
        loading: false,
        error: null,
      })),
      maxId: Math.max(s.maxId, ...messages.map((m) => m.id)),
    })),

  /** An older page, placed in front. Counts how many messages were really added. */
  prependOlder: (id, { messages, hasMore, nextCursor }) =>
    set((s) =>
      patch(s, id, (current) => {
        const merged = mergeMessages(current.messages, messages);
        return {
          messages: merged,
          prependCount: current.prependCount + (merged.length - current.messages.length),
          hasMore,
          nextCursor,
          loading: false,
        };
      }),
    ),

  /** Messages from realtime, sync, acks, or edits. Ignored for conversations never opened. */
  upsert: (messages) =>
    set((s) => {
      const list = Array.isArray(messages) ? messages : [messages];
      let next = s.byConversation;
      for (const message of list) {
        const current = next[message.conversationId];
        if (current?.loaded) {
          next = {
            ...next,
            [message.conversationId]: {
              ...current,
              messages: mergeMessages(current.messages, [message]),
            },
          };
        }
      }
      const serverIds = list.map((m) => m.id).filter((id) => typeof id === 'number');
      return { byConversation: next, maxId: Math.max(s.maxId, ...serverIds) };
    }),

  addPending: (message) =>
    set((s) =>
      patch(s, message.conversationId, (current) => ({
        messages: mergeMessages(current.messages, [message]),
        loaded: true,
      })),
    ),

  setPendingFailed: (conversationId, clientId, failed) =>
    set((s) =>
      patch(s, conversationId, (current) => ({
        messages: current.messages.map((m) =>
          m.pending && m.clientId === clientId ? { ...m, failed } : m,
        ),
      })),
    ),

  removePending: (conversationId, clientId) =>
    set((s) =>
      patch(s, conversationId, (current) => ({
        messages: current.messages.filter((m) => !(m.pending && m.clientId === clientId)),
      })),
    ),

  receipt: (conversationId, receipt) =>
    set((s) => {
      const current = s.byConversation[conversationId];
      if (!current?.loaded) {
        return s;
      }
      const messages = applyReceipt(current.messages, receipt);
      return messages === current.messages ? s : patch(s, conversationId, () => ({ messages }));
    }),

  deleted: (conversationId, messageId) =>
    set((s) => {
      const current = s.byConversation[conversationId];
      return current?.loaded
        ? patch(s, conversationId, () => ({ messages: markDeleted(current.messages, messageId) }))
        : s;
    }),

  drop: (conversationId) =>
    set((s) => {
      const { [conversationId]: _removed, ...rest } = s.byConversation;
      return { byConversation: rest };
    }),

  reset: () => set({ byConversation: {}, maxId: 0 }),
}));

export function selectConversation(id) {
  return (state) => state.byConversation[id] ?? EMPTY_CONVERSATION;
}

const EMPTY_CONVERSATION = Object.freeze(empty());
