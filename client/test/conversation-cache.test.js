import { describe, expect, it } from 'vitest';
import {
  applyIncomingMessage,
  conversationTitle,
  filterConversations,
  previewText,
  sortConversations,
} from '../src/lib/conversation-cache.js';

function conversation(overrides = {}) {
  return {
    id: 'c1',
    type: 'direct',
    name: null,
    counterpart: { id: 'u2', displayName: 'Bob Stone' },
    unreadCount: 0,
    archived: false,
    muted: false,
    lastMessage: { id: 1, senderId: 'u2', body: 'hello', deleted: false, attachmentName: null },
    lastMessageAt: '2026-11-20T10:00:00.000Z',
    ...overrides,
  };
}

const incoming = (overrides = {}) => ({
  id: 10,
  conversationId: 'c1',
  senderId: 'u2',
  body: 'new one',
  attachment: null,
  createdAt: '2026-11-20T11:00:00.000Z',
  ...overrides,
});

describe('titles and previews', () => {
  it('names direct chats after the counterpart and groups after the group', () => {
    expect(conversationTitle(conversation())).toBe('Bob Stone');
    expect(conversationTitle(conversation({ type: 'group', name: 'Team' }))).toBe('Team');
  });

  it('prefixes own messages and describes attachments and deletions', () => {
    expect(previewText(conversation(), 'me')).toBe('hello');
    expect(previewText(conversation(), 'u2')).toBe('You: hello');
    const file = conversation({
      lastMessage: {
        id: 2,
        senderId: 'u2',
        body: '',
        deleted: false,
        attachmentName: 'a.pdf',
        attachmentKind: 'file',
      },
    });
    expect(previewText(file, 'me')).toBe('File: a.pdf');
    const photo = conversation({
      lastMessage: {
        id: 2,
        senderId: 'u2',
        body: '',
        deleted: false,
        attachmentName: 'a.png',
        attachmentKind: 'image',
      },
    });
    expect(previewText(photo, 'me')).toBe('Photo: a.png');
    const gone = conversation({ lastMessage: { id: 3, senderId: 'u2', body: '', deleted: true } });
    expect(previewText(gone, 'me')).toBe('Message deleted');
    expect(previewText(conversation({ lastMessage: null }), 'me')).toBe('No messages yet');
  });
});

describe('filtering', () => {
  const list = [
    conversation({ id: 'a', unreadCount: 2 }),
    conversation({ id: 'b', archived: true }),
    conversation({ id: 'c', type: 'group', name: 'Team Alpha' }),
  ];

  it('hides archived conversations except under the archived filter', () => {
    expect(filterConversations(list, {}).map((c) => c.id)).toEqual(['a', 'c']);
    expect(filterConversations(list, { filter: 'archived' }).map((c) => c.id)).toEqual(['b']);
  });

  it('filters unread, groups, and by search text', () => {
    expect(filterConversations(list, { filter: 'unread' }).map((c) => c.id)).toEqual(['a']);
    expect(filterConversations(list, { scope: 'groups' }).map((c) => c.id)).toEqual(['c']);
    expect(filterConversations(list, { query: ' alpha ' }).map((c) => c.id)).toEqual(['c']);
    expect(filterConversations(list, { query: 'zzz' })).toEqual([]);
  });

  it('sorts by latest activity, newest first', () => {
    const sorted = sortConversations([
      conversation({ id: 'old', lastMessageAt: '2026-11-01T00:00:00.000Z' }),
      conversation({ id: 'new', lastMessageAt: '2026-11-20T00:00:00.000Z' }),
    ]);
    expect(sorted.map((c) => c.id)).toEqual(['new', 'old']);
  });
});

describe('applyIncomingMessage', () => {
  it("bumps the unread count for others' messages in a conversation not being viewed", () => {
    const [updated] = applyIncomingMessage([conversation()], incoming(), {
      meId: 'me',
      isViewing: false,
    });
    expect(updated.unreadCount).toBe(1);
    expect(updated.lastMessage.body).toBe('new one');
    expect(updated.lastMessageAt).toBe('2026-11-20T11:00:00.000Z');
  });

  it("does not count messages in the open conversation or one's own messages", () => {
    const [viewing] = applyIncomingMessage([conversation()], incoming(), {
      meId: 'me',
      isViewing: true,
    });
    expect(viewing.unreadCount).toBe(0);
    const [own] = applyIncomingMessage([conversation()], incoming({ senderId: 'me' }), {
      meId: 'me',
      isViewing: false,
    });
    expect(own.unreadCount).toBe(0);
  });

  it('is idempotent: the same message delivered twice counts once', () => {
    const once = applyIncomingMessage([conversation()], incoming(), {
      meId: 'me',
      isViewing: false,
    });
    const twice = applyIncomingMessage(once, incoming(), { meId: 'me', isViewing: false });
    expect(twice[0].unreadCount).toBe(1);
  });

  it('moves the conversation to the top and un-archives it for new messages from others', () => {
    const list = [
      conversation({ id: 'x', lastMessageAt: '2026-11-20T10:30:00.000Z' }),
      conversation({ id: 'c1', archived: true }),
    ];
    const result = applyIncomingMessage(list, incoming(), { meId: 'me', isViewing: false });
    expect(result.map((c) => c.id)).toEqual(['c1', 'x']);
    expect(result[0].archived).toBe(false);
  });

  it('returns null for an unknown conversation so the caller refetches', () => {
    expect(applyIncomingMessage([], incoming(), { meId: 'me', isViewing: false })).toBeNull();
  });
});
