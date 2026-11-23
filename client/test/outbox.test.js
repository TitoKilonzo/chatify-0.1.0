import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError, api } from '../src/lib/api.js';
import {
  addToOutbox,
  clearOutbox,
  isPermanentFailure,
  loadOutbox,
  MAX_AGE_MS,
  MAX_ENTRIES,
  removeFromOutbox,
} from '../src/lib/outbox.js';
import { discardFailed, flushOutbox, sendMessage } from '../src/features/chat/messageActions.js';
import { useMessageStore } from '../src/stores/messageStore.js';

function memoryStorage() {
  const data = new Map();
  return {
    getItem: (key) => (data.has(key) ? data.get(key) : null),
    setItem: (key, value) => data.set(key, String(value)),
    removeItem: (key) => data.delete(key),
    keys: () => [...data.keys()],
  };
}

const entry = (n, extra = {}) => ({
  clientId: `c${n}`,
  conversationId: 'conv-1',
  body: `message ${n}`,
  attachment: null,
  createdAt: Date.now() + n,
  ...extra,
});

describe('outbox storage', () => {
  it('stores entries per user, oldest first, and replaces duplicates by clientId', () => {
    const storage = memoryStorage();
    addToOutbox('u1', entry(2), { storage });
    addToOutbox('u1', entry(1), { storage });
    addToOutbox('u1', entry(2, { body: 'edited' }), { storage });
    addToOutbox('u2', entry(9), { storage });
    const list = loadOutbox('u1', { storage });
    expect(list.map((e) => e.clientId)).toEqual(['c1', 'c2']);
    expect(list[1].body).toBe('edited');
    expect(loadOutbox('u2', { storage })).toHaveLength(1);
  });

  it('drops expired and malformed entries and survives corrupt storage', () => {
    const storage = memoryStorage();
    storage.setItem(
      'chatify:outbox:u1',
      JSON.stringify([entry(1, { createdAt: 0 }), { nope: true }, entry(3)]),
    );
    // c1 is older than the maximum age and the object without fields is malformed; only c3 stays.
    expect(loadOutbox('u1', { storage }).map((e) => e.clientId)).toEqual(['c3']);
    // Looking again far in the future expires c3 as well.
    const later = Date.now() + MAX_AGE_MS + 60_000;
    expect(loadOutbox('u1', { storage, now: later })).toEqual([]);
    storage.setItem('chatify:outbox:u1', '{not json');
    expect(loadOutbox('u1', { storage })).toEqual([]);
  });

  it('removes entries, clears a user, and caps the size', () => {
    const storage = memoryStorage();
    for (let i = 0; i < MAX_ENTRIES + 5; i += 1) {
      addToOutbox('u1', entry(i), { storage });
    }
    const list = loadOutbox('u1', { storage });
    expect(list).toHaveLength(MAX_ENTRIES);
    expect(list.at(-1).clientId).toBe(`c${MAX_ENTRIES + 4}`);
    removeFromOutbox('u1', list[0].clientId, { storage });
    expect(loadOutbox('u1', { storage })).toHaveLength(MAX_ENTRIES - 1);
    clearOutbox('u1', { storage });
    expect(storage.keys()).toEqual([]);
  });

  it('does nothing without storage or a user', () => {
    expect(loadOutbox('u1', { storage: null })).toEqual([]);
    expect(() => addToOutbox(null, entry(1), { storage: memoryStorage() })).not.toThrow();
  });

  it('classifies permanent rejections apart from network and server faults', () => {
    expect(isPermanentFailure(new ApiError({ status: 403, code: 'X', message: 'no' }))).toBe(true);
    expect(isPermanentFailure(new ApiError({ status: 400, code: 'X', message: 'no' }))).toBe(true);
    for (const status of [401, 408, 429, 500, 503]) {
      expect(isPermanentFailure({ status })).toBe(false);
    }
    expect(isPermanentFailure(new TypeError('Failed to fetch'))).toBe(false);
  });
});

describe('offline send flow', () => {
  let storage;
  beforeEach(() => {
    storage = memoryStorage();
    vi.stubGlobal('localStorage', storage);
    useMessageStore.getState().reset();
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  const send = () =>
    sendMessage({ conversationId: 'conv-1', senderId: 'me', body: 'hello offline' });

  it('keeps a message that could not be delivered, marked as failed on screen', async () => {
    vi.spyOn(api, 'post').mockRejectedValue(new TypeError('Failed to fetch'));
    await send();
    const [queued] = loadOutbox('me');
    expect(queued).toMatchObject({ body: 'hello offline', conversationId: 'conv-1' });
    const [shown] = useMessageStore.getState().byConversation['conv-1'].messages;
    expect(shown).toMatchObject({ pending: true, failed: true });
  });

  it('removes the entry once the server accepts the message', async () => {
    vi.spyOn(api, 'post').mockResolvedValue({
      message: {
        id: 7,
        clientId: 'will-be-replaced',
        conversationId: 'conv-1',
        senderId: 'me',
        body: 'hello offline',
        createdAt: new Date().toISOString(),
        receipts: [],
      },
    });
    await send();
    expect(loadOutbox('me')).toEqual([]);
  });

  it('resends leftovers from a previous visit with the same clientId, then clears them', async () => {
    addToOutbox('me', entry(1));
    const post = vi.spyOn(api, 'post').mockResolvedValue({
      message: {
        id: 8,
        clientId: 'c1',
        conversationId: 'conv-1',
        senderId: 'me',
        body: 'message 1',
        createdAt: new Date().toISOString(),
        receipts: [],
      },
    });
    flushOutbox('me');
    await vi.waitFor(() => expect(loadOutbox('me')).toEqual([]));
    expect(post).toHaveBeenCalledWith('/conversations/conv-1/messages', {
      clientId: 'c1',
      body: 'message 1',
      attachmentId: undefined,
    });
  });

  it('does not send the same entry twice when flushed repeatedly', async () => {
    addToOutbox('me', entry(1));
    let resolve;
    const post = vi.spyOn(api, 'post').mockImplementation(() => new Promise((r) => (resolve = r)));
    flushOutbox('me');
    flushOutbox('me');
    expect(post).toHaveBeenCalledTimes(1);
    resolve({
      message: {
        id: 1,
        clientId: 'c1',
        conversationId: 'conv-1',
        senderId: 'me',
        body: 'x',
        createdAt: new Date().toISOString(),
        receipts: [],
      },
    });
    await vi.waitFor(() => expect(loadOutbox('me')).toEqual([]));
  });

  it('keeps entries after a network failure but drops ones the server rejected for good', async () => {
    addToOutbox('me', entry(1));
    addToOutbox('me', entry(2));
    vi.spyOn(api, 'post')
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockRejectedValueOnce(new ApiError({ status: 403, code: 'NOT_MEMBER', message: 'no' }));
    flushOutbox('me');
    await vi.waitFor(() => expect(loadOutbox('me').map((e) => e.clientId)).toEqual(['c1']));
  });

  it('discarding a failed message removes it from the outbox', async () => {
    vi.spyOn(api, 'post').mockRejectedValue(new TypeError('Failed to fetch'));
    await send();
    const [shown] = useMessageStore.getState().byConversation['conv-1'].messages;
    discardFailed(shown);
    expect(loadOutbox('me')).toEqual([]);
  });
});
