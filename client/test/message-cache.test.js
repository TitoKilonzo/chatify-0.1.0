import { describe, expect, it } from 'vitest';
import {
  applyReceipt,
  continuesRun,
  countAtLeast,
  createPending,
  markDeleted,
  mergeMessages,
  messageStatus,
  startsNewDay,
} from '../src/lib/message-cache.js';

let nextId = 1;
function message(overrides = {}) {
  const id = overrides.id ?? nextId++;
  return {
    id,
    clientId: `client-${id}`,
    conversationId: 'c1',
    senderId: 'alice',
    body: `m${id}`,
    attachment: null,
    editedAt: null,
    deletedAt: null,
    createdAt: new Date(2026, 10, 20, 10, id).toISOString(),
    receipts: [{ userId: 'bob', state: 'sent' }],
    ...overrides,
  };
}

describe('mergeMessages', () => {
  it('keeps messages ordered by time then id regardless of arrival order', () => {
    const merged = mergeMessages([message({ id: 3 })], [message({ id: 1 }), message({ id: 2 })]);
    expect(merged.map((m) => m.id)).toEqual([1, 2, 3]);
  });

  it('never duplicates a message that arrives twice (live and via sync)', () => {
    const first = message({ id: 5 });
    const merged = mergeMessages(mergeMessages([], [first]), [first, first]);
    expect(merged).toHaveLength(1);
  });

  it('lets a newer copy of the same id replace the older one (edits)', () => {
    const original = message({ id: 7, body: 'old' });
    const merged = mergeMessages([original], [{ ...original, body: 'new', editedAt: 'now' }]);
    expect(merged[0].body).toBe('new');
  });

  it('replaces a pending message with its confirmed twin by clientId', () => {
    const pending = createPending({
      clientId: 'abc-123-xyz',
      conversationId: 'c1',
      senderId: 'alice',
      body: 'hi',
    });
    const confirmed = message({ id: 9, clientId: 'abc-123-xyz', body: 'hi' });
    const merged = mergeMessages([pending], [confirmed]);
    expect(merged).toHaveLength(1);
    expect(merged[0].id).toBe(9);
    expect(merged[0].pending).toBeUndefined();
  });

  it('sorts pending messages after confirmed ones created at the same instant', () => {
    const at = new Date(2026, 10, 20, 12).toISOString();
    const confirmed = message({ id: 4, createdAt: at });
    const pending = {
      ...createPending({ clientId: 'p-1-aaaa', conversationId: 'c1', senderId: 'a', body: 'x' }),
      createdAt: at,
    };
    expect(mergeMessages([pending], [confirmed]).map((m) => m.id)).toEqual([4, 'pending:p-1-aaaa']);
  });
});

describe('receipts', () => {
  it('moves a recipient forward up to the given message only', () => {
    const list = [message({ id: 1 }), message({ id: 2 }), message({ id: 3 })];
    const next = applyReceipt(list, { userId: 'bob', upToMessageId: 2, state: 'delivered' });
    expect(next.map((m) => m.receipts[0].state)).toEqual(['delivered', 'delivered', 'sent']);
  });

  it('never moves backwards', () => {
    const list = [message({ id: 1, receipts: [{ userId: 'bob', state: 'read' }] })];
    const next = applyReceipt(list, { userId: 'bob', upToMessageId: 1, state: 'delivered' });
    expect(next).toBe(list);
  });

  it("ignores a user's receipts for their own messages and for other users", () => {
    const list = [message({ id: 1 })];
    expect(applyReceipt(list, { userId: 'alice', upToMessageId: 1, state: 'read' })).toBe(list);
    expect(applyReceipt(list, { userId: 'carol', upToMessageId: 1, state: 'read' })).toBe(list);
  });

  it('derives a group status from the weakest recipient', () => {
    const grouped = message({
      receipts: [
        { userId: 'bob', state: 'read' },
        { userId: 'carol', state: 'delivered' },
      ],
    });
    expect(messageStatus(grouped)).toBe('delivered');
    expect(countAtLeast(grouped, 'read')).toBe(1);
    const allRead = message({
      receipts: [
        { userId: 'bob', state: 'read' },
        { userId: 'carol', state: 'read' },
      ],
    });
    expect(messageStatus(allRead)).toBe('read');
  });

  it('reports sending and failed for unconfirmed messages', () => {
    const pending = createPending({
      clientId: 'p-2-bbbb',
      conversationId: 'c',
      senderId: 'a',
      body: 'x',
    });
    expect(messageStatus(pending)).toBe('sending');
    expect(messageStatus({ ...pending, failed: true })).toBe('failed');
  });
});

describe('deletion and grouping', () => {
  it('clears body and attachment on delete but keeps the slot', () => {
    const list = [message({ id: 1, body: 'secret', attachment: { id: 'a' } })];
    const [deleted] = markDeleted(list, 1);
    expect(deleted.body).toBe('');
    expect(deleted.attachment).toBeNull();
    expect(deleted.deletedAt).toBeTruthy();
  });

  it('marks the first message of each day and runs from the same sender', () => {
    const list = [
      message({ id: 1, createdAt: new Date(2026, 10, 19, 23, 59).toISOString() }),
      message({ id: 2, createdAt: new Date(2026, 10, 20, 0, 1).toISOString() }),
      message({ id: 3, createdAt: new Date(2026, 10, 20, 0, 2).toISOString() }),
      message({ id: 4, senderId: 'bob', createdAt: new Date(2026, 10, 20, 0, 3).toISOString() }),
      message({ id: 5, senderId: 'bob', createdAt: new Date(2026, 10, 20, 1, 30).toISOString() }),
    ];
    expect([0, 1, 2, 3].map((i) => startsNewDay(list, i))).toEqual([true, true, false, false]);
    expect([1, 2, 3, 4].map((i) => continuesRun(list, i))).toEqual([false, true, false, false]);
  });
});
