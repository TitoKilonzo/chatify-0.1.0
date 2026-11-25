import { beforeEach, describe, expect, it } from 'vitest';
import { useMessageStore } from '../src/stores/messageStore.js';

const base = { conversationId: 'c1', senderId: 'u', body: 'x', receipts: [] };
const at = (n) => new Date(1_700_000_000_000 + n).toISOString();

describe('disappearing messages in the store', () => {
  beforeEach(() => {
    useMessageStore.getState().reset();
    useMessageStore.getState().setLatest('c1', {
      messages: [
        { ...base, id: 1, clientId: 'a', createdAt: at(0), expiresAt: at(1000) },
        { ...base, id: 2, clientId: 'b', createdAt: at(1), expiresAt: null },
        { ...base, id: 3, clientId: 'c', createdAt: at(2), expiresAt: at(9000) },
      ],
      hasMore: false,
      nextCursor: null,
    });
  });

  const ids = () => useMessageStore.getState().byConversation.c1.messages.map((m) => m.id);

  it('drops messages whose time has passed', () => {
    useMessageStore.getState().dropExpired(1_700_000_000_000 + 5000);
    expect(ids()).toEqual([2, 3]);
  });

  it('removes messages the server reports as expired', () => {
    useMessageStore.getState().expire('c1', [2, 3]);
    expect(ids()).toEqual([1]);
  });
});
