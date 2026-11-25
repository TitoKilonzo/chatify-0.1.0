import { afterEach, describe, expect, it, vi } from 'vitest';
import { isSavingData } from '../src/stores/dataSaver.js';

describe('data saver', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('uses the explicit choice first', () => {
    expect(isSavingData(true)).toBe(true);
    expect(isSavingData(false)).toBe(false);
  });

  it('follows the browser hint until a choice is made', () => {
    vi.stubGlobal('navigator', { connection: { saveData: true } });
    expect(isSavingData(null)).toBe(true);
    expect(isSavingData(false)).toBe(false);
    vi.stubGlobal('navigator', { connection: { saveData: false } });
    expect(isSavingData(null)).toBe(false);
  });
});
