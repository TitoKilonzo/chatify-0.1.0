/** Up to two uppercase initials from a display name. */
export function getInitials(name) {
  const words = String(name ?? '')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (words.length === 0) {
    return '';
  }
  const first = words[0][0];
  const last = words.length > 1 ? words[words.length - 1][0] : '';
  return (first + last).toUpperCase();
}

const UNITS = ['B', 'KB', 'MB', 'GB'];

/** Human file size: 1536 -> "1.5 KB". */
export function formatBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes < 0) {
    return '';
  }
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < UNITS.length - 1) {
    value /= 1024;
    unit += 1;
  }
  const rounded = unit === 0 || value >= 10 ? Math.round(value) : Math.round(value * 10) / 10;
  return `${rounded} ${UNITS[unit]}`;
}

/** Milliseconds as m:ss, for voice note lengths. */
export function formatDuration(ms) {
  const totalSeconds = Math.max(0, Math.round((ms ?? 0) / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = String(totalSeconds % 60).padStart(2, '0');
  return `${minutes}:${seconds}`;
}

/** Short description of an attachment kind, for quoted replies. */
export function attachmentLabel(kind) {
  if (kind === 'voice') {
    return 'Voice note';
  }
  return kind === 'image' ? 'Photo' : 'File';
}
