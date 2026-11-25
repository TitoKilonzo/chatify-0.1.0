import { describe, expect, it } from 'vitest';
import {
  backoffDelay,
  forgetUpload,
  rememberUpload,
  rememberedUploadId,
} from '../src/lib/resumable.js';

function memoryStorage() {
  const data = new Map();
  return {
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => data.set(key, value),
    removeItem: (key) => data.delete(key),
  };
}

const file = { name: 'movie.mp4', size: 1000, lastModified: 42 };

describe('resumable upload memory', () => {
  it('remembers a session per file and forgets it', () => {
    const storage = memoryStorage();
    expect(rememberedUploadId(file, storage)).toBeNull();
    rememberUpload(file, 'abc', storage);
    expect(rememberedUploadId(file, storage)).toBe('abc');
    expect(rememberedUploadId({ ...file, size: 1001 }, storage)).toBeNull();
    forgetUpload(file, storage);
    expect(rememberedUploadId(file, storage)).toBeNull();
  });

  it('backs off exponentially up to a cap', () => {
    expect(backoffDelay(0)).toBe(800);
    expect(backoffDelay(1)).toBe(1600);
    expect(backoffDelay(10)).toBe(15000);
  });
});
