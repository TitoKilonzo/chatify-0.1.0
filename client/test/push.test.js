import { afterEach, describe, expect, it, vi } from 'vitest';
import { disablePush } from '../src/lib/push.js';

describe('push subscription cleanup', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('does not wait forever when the browser has no service worker registration', async () => {
    const getRegistration = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('window', { PushManager: {}, Notification: {} });
    vi.stubGlobal('navigator', {
      serviceWorker: {
        getRegistration,
        ready: new Promise(() => {}),
      },
    });

    await expect(disablePush()).resolves.toBeUndefined();
    expect(getRegistration).toHaveBeenCalledOnce();
  });
});
