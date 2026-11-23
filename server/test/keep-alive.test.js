import { describe, expect, it, vi } from 'vitest';
import { startKeepAlive } from '../src/utils/keep-alive.js';

function setup(fetchImpl) {
  const logger = { warn: vi.fn() };
  let tick;
  const timer = { unref: vi.fn() };
  const stop = startKeepAlive({
    url: 'https://chatify.example.com/some/path',
    logger,
    fetchImpl,
    intervalMs: 1000,
    setIntervalImpl: (fn) => {
      tick = fn;
      return timer;
    },
    clearIntervalImpl: vi.fn(),
  });
  return { logger, tick: () => tick(), stop, timer };
}

describe('keep-alive', () => {
  it('requests the health endpoint on the public origin and does not hold the process open', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: true });
    const { tick, timer } = setup(fetchImpl);
    await tick();
    expect(fetchImpl.mock.calls[0][0]).toBe('https://chatify.example.com/api/health');
    expect(timer.unref).toHaveBeenCalled();
  });

  it('logs and keeps going when a ping fails or returns an error status', async () => {
    const fetchImpl = vi
      .fn()
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce({ ok: false, status: 503 });
    const { tick, logger } = setup(fetchImpl);
    await tick();
    await tick();
    expect(logger.warn).toHaveBeenCalledTimes(2);
  });
});
