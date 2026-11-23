import { Readable } from 'node:stream';
import { S3Client } from '@aws-sdk/client-s3';
import { describe, expect, it, vi } from 'vitest';
import { parseEnv } from '../src/config/env.js';
import { contentDisposition, createR2Storage, r2Endpoint } from '../src/storage/r2-storage.js';
import { storageOrigin } from '../src/storage/index.js';
import { newStorageKey } from '../src/storage/keys.js';

const KEY = 'ab/' + 'c'.repeat(32);

function realClient() {
  return new S3Client({
    region: 'auto',
    endpoint: 'https://acct.r2.cloudflarestorage.com',
    forcePathStyle: true,
    credentials: { accessKeyId: 'AKIDEXAMPLE', secretAccessKey: 'secret' },
  });
}

// Built from a code point so the source file stays plain ASCII.
const E = String.fromCharCode(233);

describe('contentDisposition', () => {
  it('is plain inline for images', () => {
    expect(contentDisposition('photo.png', true)).toBe('inline');
  });

  it('quotes an ASCII fallback and encodes the real name', () => {
    const value = contentDisposition(`r${E}sum${E} "final".pdf`, false);
    expect(value).toContain('attachment; filename="r_sum_ _final_.pdf"');
    expect(value).toContain("filename*=UTF-8''r%C3%A9sum%C3%A9%20%22final%22.pdf");
  });
});

describe('R2 storage driver', () => {
  it('stores objects with their content type and an immutable cache policy', async () => {
    const send = vi.fn().mockResolvedValue({});
    const storage = createR2Storage({ client: { send }, bucket: 'b', signedUrlTtlSeconds: 300 });
    await storage.put(KEY, Buffer.from('x'), { contentType: 'application/pdf' });
    const command = send.mock.calls[0][0];
    expect(command.input).toMatchObject({
      Bucket: 'b',
      Key: KEY,
      ContentType: 'application/pdf',
    });
    expect(command.input.CacheControl).toContain('immutable');
  });

  it('refuses keys it did not generate', async () => {
    const storage = createR2Storage({
      client: { send: vi.fn() },
      bucket: 'b',
      signedUrlTtlSeconds: 300,
    });
    await expect(storage.put('../etc/passwd', Buffer.from('x'))).rejects.toThrow(/Invalid/);
    await expect(storage.signedUrl('nope')).rejects.toThrow(/Invalid/);
    await expect(storage.delete('a/b')).rejects.toThrow(/Invalid/);
    expect(() => newStorageKey()).not.toThrow();
  });

  it('returns null for a missing object and rethrows other failures', async () => {
    const missing = Object.assign(new Error('gone'), { name: 'NoSuchKey' });
    const send = vi.fn().mockRejectedValueOnce(missing).mockRejectedValueOnce(new Error('boom'));
    const storage = createR2Storage({ client: { send }, bucket: 'b', signedUrlTtlSeconds: 300 });
    expect(await storage.get(KEY)).toBeNull();
    await expect(storage.get(KEY)).rejects.toThrow('boom');
  });

  it('streams an existing object', async () => {
    const send = vi.fn().mockResolvedValue({ Body: Readable.from(['hi']), ContentLength: 2 });
    const storage = createR2Storage({ client: { send }, bucket: 'b', signedUrlTtlSeconds: 300 });
    const result = await storage.get(KEY);
    expect(result.size).toBe(2);
  });

  it('signs a URL that fixes the response type and disposition, without any network call', async () => {
    const storage = createR2Storage({
      client: realClient(),
      bucket: 'chat-files',
      signedUrlTtlSeconds: 300,
      now: () => Date.UTC(2026, 10, 23, 12, 0, 0),
    });
    const url = new URL(
      await storage.signedUrl(KEY, { filename: 'invoice.pdf', contentType: 'application/pdf' }),
    );
    expect(url.origin).toBe('https://acct.r2.cloudflarestorage.com');
    expect(url.pathname).toBe(`/chat-files/${KEY}`);
    expect(url.searchParams.get('X-Amz-Expires')).toBe('300');
    expect(url.searchParams.get('X-Amz-Signature')).toMatch(/^[a-f0-9]{64}$/);
    expect(url.searchParams.get('response-content-type')).toBe('application/pdf');
    expect(url.searchParams.get('response-content-disposition')).toContain(
      'attachment; filename="invoice.pdf"',
    );
  });

  it('gives the same URL within a signing window and a new one after it', async () => {
    let clock = Date.UTC(2026, 10, 23, 12, 0, 10);
    const storage = createR2Storage({
      client: realClient(),
      bucket: 'b',
      signedUrlTtlSeconds: 300,
      now: () => clock,
    });
    const first = await storage.signedUrl(KEY, { contentType: 'image/webp', inline: true });
    clock += 60_000;
    expect(await storage.signedUrl(KEY, { contentType: 'image/webp', inline: true })).toBe(first);
    clock += 120_000;
    expect(await storage.signedUrl(KEY, { contentType: 'image/webp', inline: true })).not.toBe(
      first,
    );
  });

  it('allows redirects to be cached for less than the signed URL stays valid', () => {
    const storage = createR2Storage({
      client: { send: vi.fn() },
      bucket: 'b',
      signedUrlTtlSeconds: 300,
    });
    expect(storage.redirectCacheSeconds).toBe(140);
    expect(storage.redirectCacheSeconds).toBeLessThan(150);
  });
});

describe('storage configuration', () => {
  const base = { NODE_ENV: 'test', JWT_ACCESS_SECRET: 'x'.repeat(32) };

  it('defaults to local storage with no cloud origin', () => {
    const env = parseEnv(base);
    expect(env.STORAGE_DRIVER).toBe('local');
    expect(storageOrigin(env)).toBeNull();
  });

  it('requires credentials and a bucket for R2', () => {
    expect(() => parseEnv({ ...base, STORAGE_DRIVER: 'r2' })).toThrow(/R2_BUCKET/);
    expect(() =>
      parseEnv({
        ...base,
        STORAGE_DRIVER: 'r2',
        R2_ACCESS_KEY_ID: 'a',
        R2_SECRET_ACCESS_KEY: 'b',
        R2_BUCKET: 'c',
      }),
    ).toThrow(/R2_ACCOUNT_ID/);
  });

  it('derives the endpoint and CSP origin from the account id, or uses an explicit endpoint', () => {
    const env = parseEnv({
      ...base,
      STORAGE_DRIVER: 'r2',
      R2_ACCOUNT_ID: 'acct',
      R2_ACCESS_KEY_ID: 'a',
      R2_SECRET_ACCESS_KEY: 'b',
      R2_BUCKET: 'c',
    });
    expect(r2Endpoint(env)).toBe('https://acct.r2.cloudflarestorage.com');
    expect(storageOrigin(env)).toBe('https://acct.r2.cloudflarestorage.com');
    const custom = parseEnv({
      ...base,
      STORAGE_DRIVER: 'r2',
      R2_ENDPOINT: 'https://eu.example.com/',
      R2_ACCESS_KEY_ID: 'a',
      R2_SECRET_ACCESS_KEY: 'b',
      R2_BUCKET: 'c',
    });
    expect(storageOrigin(custom)).toBe('https://eu.example.com');
  });
});
