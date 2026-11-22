import { describe, expect, it } from 'vitest';
import {
  calendarDaysBetween,
  formatDayLabel,
  formatLastSeen,
  formatListTime,
} from '../src/lib/date.js';
import { formatBytes, getInitials } from '../src/lib/format.js';

const now = new Date(2026, 10, 20, 15, 30);

describe('dates', () => {
  it('counts calendar days across midnight, not 24-hour spans', () => {
    expect(calendarDaysBetween(new Date(2026, 10, 19, 23, 59), new Date(2026, 10, 20, 0, 1))).toBe(
      1,
    );
    expect(calendarDaysBetween(new Date(2026, 10, 20, 0, 1), new Date(2026, 10, 20, 23, 59))).toBe(
      0,
    );
  });

  it('labels days for message headings', () => {
    expect(formatDayLabel(new Date(2026, 10, 20, 1), now)).toBe('Today');
    expect(formatDayLabel(new Date(2026, 10, 19, 23), now)).toBe('Yesterday');
    expect(formatDayLabel(new Date(2026, 10, 17, 9), now)).toMatch(/Tuesday/);
    expect(formatDayLabel(new Date(2026, 9, 1, 9), now)).toMatch(/Oct/);
    expect(formatDayLabel(new Date(2025, 9, 1, 9), now)).toMatch(/2025/);
  });

  it('formats list times compactly', () => {
    expect(formatListTime(new Date(2026, 10, 20, 9, 5), now)).toMatch(/9:05/);
    expect(formatListTime(new Date(2026, 10, 19, 9, 5), now)).toBe('Yesterday');
    expect(formatListTime(null, now)).toBe('');
  });

  it('describes when someone was last seen', () => {
    expect(formatLastSeen(null, now)).toBe('Offline');
    expect(formatLastSeen(new Date(now.getTime() - 20_000), now)).toBe('Last seen just now');
    expect(formatLastSeen(new Date(now.getTime() - 5 * 60_000), now)).toBe(
      'Last seen 5 minutes ago',
    );
    expect(formatLastSeen(new Date(now.getTime() - 60_000), now)).toBe('Last seen 1 minute ago');
    expect(formatLastSeen(new Date(2026, 10, 19, 22, 0), now)).toMatch(/yesterday at/);
  });
});

describe('format helpers', () => {
  it('formats file sizes', () => {
    expect(formatBytes(0)).toBe('0 B');
    expect(formatBytes(1536)).toBe('1.5 KB');
    expect(formatBytes(25 * 1024 * 1024)).toBe('25 MB');
    expect(formatBytes(-1)).toBe('');
  });

  it('builds initials', () => {
    expect(getInitials('ada lovelace')).toBe('AL');
    expect(getInitials('  Cher ')).toBe('C');
    expect(getInitials('')).toBe('');
  });
});
