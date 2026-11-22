const MINUTE = 60_000;
const DAY = 24 * 60 * MINUTE;

function startOfDay(date) {
  const copy = new Date(date);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

/** Whole calendar days from a to b in local time (b later than a gives a positive number). */
export function calendarDaysBetween(a, b) {
  return Math.round((startOfDay(b).getTime() - startOfDay(a).getTime()) / DAY);
}

export function isSameDay(a, b) {
  return calendarDaysBetween(a, b) === 0;
}

const timeFormat = new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' });
const weekdayFormat = new Intl.DateTimeFormat(undefined, { weekday: 'long' });
const shortWeekdayFormat = new Intl.DateTimeFormat(undefined, { weekday: 'short' });
const monthDayFormat = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' });
const fullDateFormat = new Intl.DateTimeFormat(undefined, {
  year: 'numeric',
  month: 'short',
  day: 'numeric',
});

/** Clock time of a message, for example "3:07 PM". */
export function formatMessageTime(value) {
  return timeFormat.format(new Date(value));
}

/** Heading above the first message of a day: Today, Yesterday, a weekday, or a date. */
export function formatDayLabel(value, now = new Date()) {
  const date = new Date(value);
  const days = calendarDaysBetween(date, now);
  if (days === 0) {
    return 'Today';
  }
  if (days === 1) {
    return 'Yesterday';
  }
  if (days > 1 && days < 7) {
    return weekdayFormat.format(date);
  }
  return date.getFullYear() === now.getFullYear()
    ? monthDayFormat.format(date)
    : fullDateFormat.format(date);
}

/** Compact timestamp for the conversation list: time today, weekday this week, else a date. */
export function formatListTime(value, now = new Date()) {
  if (!value) {
    return '';
  }
  const date = new Date(value);
  const days = calendarDaysBetween(date, now);
  if (days <= 0) {
    return formatMessageTime(date);
  }
  if (days === 1) {
    return 'Yesterday';
  }
  if (days < 7) {
    return shortWeekdayFormat.format(date);
  }
  return date.getFullYear() === now.getFullYear()
    ? monthDayFormat.format(date)
    : fullDateFormat.format(date);
}

/** "last seen 5 minutes ago" style text for an offline user. */
export function formatLastSeen(value, now = new Date()) {
  if (!value) {
    return 'Offline';
  }
  const date = new Date(value);
  const elapsed = now.getTime() - date.getTime();
  if (elapsed < MINUTE) {
    return 'Last seen just now';
  }
  if (elapsed < 60 * MINUTE) {
    const minutes = Math.floor(elapsed / MINUTE);
    return `Last seen ${minutes} minute${minutes === 1 ? '' : 's'} ago`;
  }
  const days = calendarDaysBetween(date, now);
  if (days === 0) {
    return `Last seen today at ${formatMessageTime(date)}`;
  }
  if (days === 1) {
    return `Last seen yesterday at ${formatMessageTime(date)}`;
  }
  return `Last seen ${formatListTime(date, now)}`;
}
