import { describe, expect, it } from 'vitest';
import { attachmentLabel, formatDuration } from '../src/lib/format.js';
import { addToOutbox, loadOutbox } from '../src/lib/outbox.js';

function memoryStorage() {
  const data = new Map();
  return {
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => data.set(key, value),
    removeItem: (key) => data.delete(key),
  };
}

describe('voice and reply helpers', () => {
  it('formats durations as m:ss', () => {
    expect(formatDuration(0)).toBe('0:00');
    expect(formatDuration(4200)).toBe('0:04');
    expect(formatDuration(61_000)).toBe('1:01');
    expect(formatDuration(null)).toBe('0:00');
  });

  it('labels attachment kinds', () => {
    expect(attachmentLabel('voice')).toBe('Voice note');
    expect(attachmentLabel('image')).toBe('Photo');
    expect(attachmentLabel(null)).toBe('File');
  });

  it('keeps the reply target in the outbox', () => {
    const storage = memoryStorage();
    const replyTo = { id: 7, senderId: 'u1', body: 'hi', deleted: false, attachmentKind: null };
    addToOutbox(
      'me',
      { clientId: 'c1', conversationId: 'k', body: 'yo', attachment: null, replyTo },
      { storage },
    );
    expect(loadOutbox('me', { storage })[0].replyTo).toEqual(replyTo);
  });
});
