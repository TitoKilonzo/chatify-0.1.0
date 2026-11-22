import { beforeEach, describe, expect, it } from 'vitest';
import { createPending } from '../src/lib/message-cache.js';
import { selectConversation, useMessageStore } from '../src/stores/messageStore.js';

const store = () => useMessageStore.getState();
const get = (id) => selectConversation(id)(store());

function msg(id, extra = {}) {
  return {
    id,
    clientId: `client-${id}-xxxx`,
    conversationId: 'c1',
    senderId: 'a',
    body: `m${id}`,
    attachment: null,
    editedAt: null,
    deletedAt: null,
    createdAt: new Date(2026, 10, 20, 10, id).toISOString(),
    receipts: [{ userId: 'b', state: 'sent' }],
    ...extra,
  };
}

describe('message store', () => {
  beforeEach(() => store().reset());

  it('tracks the highest server id seen as the sync cursor', () => {
    store().setLatest('c1', { messages: [msg(3), msg(4)], hasMore: false, nextCursor: null });
    store().upsert(msg(9, { conversationId: 'c2' }));
    expect(store().maxId).toBe(9);
  });

  it('ignores realtime messages for conversations that were never opened, but still advances maxId', () => {
    store().upsert(msg(5));
    expect(get('c1').loaded).toBe(false);
    expect(store().maxId).toBe(5);
  });

  it('prepends older pages and counts how many were really added', () => {
    store().setLatest('c1', { messages: [msg(5), msg(6)], hasMore: true, nextCursor: '1.5' });
    store().prependOlder('c1', {
      messages: [msg(3), msg(4), msg(5)],
      hasMore: false,
      nextCursor: null,
    });
    expect(get('c1').messages.map((m) => m.id)).toEqual([3, 4, 5, 6]);
    expect(get('c1').prependCount).toBe(2);
    expect(get('c1').hasMore).toBe(false);
  });

  it('shows a pending message at once and swaps it for the confirmed copy without a flash', () => {
    store().setLatest('c1', { messages: [msg(1)], hasMore: false, nextCursor: null });
    const pending = createPending({
      clientId: 'send-1-abcd',
      conversationId: 'c1',
      senderId: 'a',
      body: 'hi',
    });
    store().addPending(pending);
    expect(get('c1').messages).toHaveLength(2);
    store().upsert(msg(2, { clientId: 'send-1-abcd', body: 'hi' }));
    expect(get('c1').messages.map((m) => m.id)).toEqual([1, 2]);
  });

  it('flags a failed pending message and lets it be retried or discarded', () => {
    const pending = createPending({
      clientId: 'send-2-abcd',
      conversationId: 'c1',
      senderId: 'a',
      body: 'x',
    });
    store().addPending(pending);
    store().setPendingFailed('c1', 'send-2-abcd', true);
    expect(get('c1').messages[0].failed).toBe(true);
    store().removePending('c1', 'send-2-abcd');
    expect(get('c1').messages).toHaveLength(0);
  });

  it('applies receipts and deletions to loaded conversations', () => {
    store().setLatest('c1', { messages: [msg(1), msg(2)], hasMore: false, nextCursor: null });
    store().receipt('c1', { userId: 'b', upToMessageId: 1, state: 'read' });
    expect(get('c1').messages.map((m) => m.receipts[0].state)).toEqual(['read', 'sent']);
    store().deleted('c1', 2);
    expect(get('c1').messages[1].deletedAt).toBeTruthy();
  });

  it('refreshing the newest page merges instead of discarding older loaded history', () => {
    store().setLatest('c1', { messages: [msg(5), msg(6)], hasMore: true, nextCursor: '1.5' });
    store().prependOlder('c1', { messages: [msg(3), msg(4)], hasMore: true, nextCursor: '1.3' });
    store().setLatest('c1', {
      messages: [msg(5), msg(6), msg(7)],
      hasMore: true,
      nextCursor: '1.5',
    });
    expect(get('c1').messages.map((m) => m.id)).toEqual([3, 4, 5, 6, 7]);
    expect(get('c1').nextCursor).toBe('1.3');
  });
});
