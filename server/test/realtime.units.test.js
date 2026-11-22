import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { detectMime, sanitizeFileName } from '../src/modules/attachments/file-validation.js';
import { createRateWindow } from '../src/realtime/rate-window.js';
import { createTyping } from '../src/realtime/typing.js';
import { createLocalStorage, newStorageKey } from '../src/storage/local-storage.js';
import { createEventBus } from '../src/utils/events.js';

describe('rate window', () => {
  it('allows up to max hits per window, then recovers', () => {
    let now = 0;
    const limiter = createRateWindow({ max: 3, windowMs: 1000, now: () => now });
    expect([limiter.allow(), limiter.allow(), limiter.allow(), limiter.allow()]).toEqual([
      true,
      true,
      true,
      false,
    ]);
    now = 1000;
    expect(limiter.allow()).toBe(true);
  });
});

describe('typing state', () => {
  afterEach(() => vi.useRealTimers());

  it('broadcasts once per burst and expires by itself', () => {
    vi.useFakeTimers();
    const broadcast = vi.fn();
    const typing = createTyping({ broadcast, ttlMs: 3000 });
    typing.start('c1', 'u1');
    typing.start('c1', 'u1');
    vi.advanceTimersByTime(2000);
    typing.start('c1', 'u1');
    vi.advanceTimersByTime(2999);
    expect(broadcast.mock.calls).toEqual([['c1', 'u1', true]]);
    vi.advanceTimersByTime(2);
    expect(broadcast.mock.calls).toEqual([
      ['c1', 'u1', true],
      ['c1', 'u1', false],
    ]);
  });

  it('stops explicitly and ignores a stop that was never started', () => {
    vi.useFakeTimers();
    const broadcast = vi.fn();
    const typing = createTyping({ broadcast });
    typing.stop('c1', 'u1');
    expect(broadcast).not.toHaveBeenCalled();
    typing.start('c1', 'u1');
    typing.stopAllForUser('u1');
    expect(broadcast).toHaveBeenLastCalledWith('c1', 'u1', false);
  });
});

describe('event bus', () => {
  it('isolates failing subscribers from the publisher and from each other', async () => {
    const onError = vi.fn();
    const bus = createEventBus({ onError });
    const good = vi.fn();
    bus.subscribe('x', () => {
      throw new Error('sync failure');
    });
    bus.subscribe('x', async () => {
      throw new Error('async failure');
    });
    bus.subscribe('x', good);
    expect(() => bus.publish('x', { n: 1 })).not.toThrow();
    await new Promise((resolve) => setImmediate(resolve));
    expect(good).toHaveBeenCalledWith({ n: 1 });
    expect(onError).toHaveBeenCalledTimes(2);
  });

  it('unsubscribes', () => {
    const bus = createEventBus();
    const handler = vi.fn();
    const off = bus.subscribe('x', handler);
    off();
    bus.publish('x', {});
    expect(handler).not.toHaveBeenCalled();
  });
});

describe('local storage', () => {
  let dir;
  afterEach(async () => {
    if (dir) {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('stores, reads, and deletes by generated key', async () => {
    dir = await mkdtemp(path.join(os.tmpdir(), 'chatify-store-'));
    const storage = createLocalStorage({ baseDir: dir });
    const { key } = newStorageKey();
    await storage.put(key, Buffer.from('hello'));
    const file = await storage.get(key);
    expect(file.size).toBe(5);
    file.stream.destroy();
    await storage.delete(key);
    expect(await storage.get(key)).toBeNull();
    expect(await storage.signedUrl(key)).toBeNull();
  });

  it('refuses keys that could escape the storage directory', async () => {
    dir = await mkdtemp(path.join(os.tmpdir(), 'chatify-store-'));
    const storage = createLocalStorage({ baseDir: dir });
    for (const bad of ['../etc/passwd', '/etc/passwd', 'ab/../../x', 'ab/short', '']) {
      await expect(storage.get(bad)).rejects.toThrow('Invalid storage key');
      await expect(storage.put(bad, Buffer.from('x'))).rejects.toThrow('Invalid storage key');
    }
  });

  it('never overwrites an existing key', async () => {
    dir = await mkdtemp(path.join(os.tmpdir(), 'chatify-store-'));
    const storage = createLocalStorage({ baseDir: dir });
    const { key } = newStorageKey();
    await storage.put(key, Buffer.from('one'));
    await expect(storage.put(key, Buffer.from('two'))).rejects.toThrow();
  });
});

describe('file validation', () => {
  it('detects images by signature regardless of extension', async () => {
    const png = await sharp({ create: { width: 4, height: 4, channels: 3, background: '#fff' } })
      .png()
      .toBuffer();
    expect(await detectMime(png, 'anything.bin')).toEqual({ mimeType: 'image/png' });
    expect(await detectMime(png, 'photo.jpg')).toEqual({ mimeType: 'image/png' });
  });

  it('accepts text only with an allowed extension and valid UTF-8', async () => {
    expect(await detectMime(Buffer.from('a,b\n1,2\n'), 'data.csv')).toEqual({
      mimeType: 'text/csv',
    });
    await expect(detectMime(Buffer.from('a,b'), 'data.exe')).rejects.toMatchObject({ status: 415 });
    await expect(detectMime(Buffer.from([0xc3, 0x28]), 'bad.txt')).rejects.toMatchObject({
      status: 415,
    });
  });

  it('rejects executables, scripts, and markup', async () => {
    const cases = [
      [Buffer.concat([Buffer.from('MZ'), Buffer.alloc(100)]), 'a.exe'],
      [Buffer.concat([Buffer.from([0x7f, 0x45, 0x4c, 0x46]), Buffer.alloc(100)]), 'a.bin'],
      [Buffer.from('#!/bin/sh\nrm -rf /\n'), 'run.sh'],
      [Buffer.from('<!doctype html><script>1</script>'), 'index.html'],
      [Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>'), 'a.svg'],
    ];
    for (const [buffer, name] of cases) {
      await expect(detectMime(buffer, name)).rejects.toMatchObject({ status: 415 });
    }
  });

  it('sanitises file names', () => {
    expect(sanitizeFileName('../../a/b/report.pdf')).toBe('report.pdf');
    expect(sanitizeFileName('C:\\Users\\me\\x.docx')).toBe('x.docx');
    expect(sanitizeFileName('we"ird\r\nname.txt')).toBe('weirdname.txt');
    expect(sanitizeFileName('')).toBe('file');
    expect(sanitizeFileName('x'.repeat(400) + '.pdf').length).toBeLessThanOrEqual(150);
  });
});
