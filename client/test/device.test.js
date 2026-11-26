import { describe, expect, it } from 'vitest';
import { describeDevice } from '../src/lib/device.js';

describe('describeDevice', () => {
  it('names common browsers and systems', () => {
    expect(
      describeDevice(
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36',
      ),
    ).toEqual({ label: 'Chrome on Windows', mobile: false });
    expect(
      describeDevice(
        'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/126.0 Mobile Safari/537.36',
      ),
    ).toEqual({ label: 'Chrome on Android', mobile: true });
    expect(
      describeDevice(
        'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 Version/17.5 Mobile/15E148 Safari/604.1',
      ),
    ).toEqual({ label: 'Safari on iOS', mobile: true });
    expect(
      describeDevice('Mozilla/5.0 (X11; Linux x86_64; rv:127.0) Gecko/20100101 Firefox/127.0')
        .label,
    ).toBe('Firefox on Linux');
    expect(describeDevice('Mozilla/5.0 (Windows NT 10.0) Chrome/126.0 Edg/126.0').label).toBe(
      'Edge on Windows',
    );
  });

  it('handles missing or odd input', () => {
    expect(describeDevice(null).label).toBe('Unknown device');
    expect(describeDevice('curl/8').label).toBe('Browser');
  });
});
