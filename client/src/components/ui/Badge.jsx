import { cx } from '../../lib/cx.js';
import styles from './Badge.module.css';

/**
 * Unread count badge (Cherry Red). Renders nothing for zero. Counts above max display as "max+".
 * Screen readers get the full count with a noun, for example "12 unread".
 */
export function Badge({ count, max = 99, noun = 'unread', className }) {
  if (!count || count < 1) {
    return null;
  }
  const text = count > max ? `${max}+` : String(count);
  return (
    <span className={cx(styles.badge, className)}>
      <span aria-hidden="true">{text}</span>
      <span className="visually-hidden">{`${count} ${noun}`}</span>
    </span>
  );
}
