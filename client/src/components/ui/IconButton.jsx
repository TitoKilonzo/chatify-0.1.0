import { cx } from '../../lib/cx.js';
import styles from './IconButton.module.css';

/**
 * Icon-only button. The label is required: it becomes the accessible name.
 * variant: ghost | inverse (on Cocoa surfaces) | primary (Cherry, e.g. the send button).
 */
export function IconButton({
  label,
  icon: Icon,
  variant = 'ghost',
  size = 'md',
  type = 'button',
  className,
  ...rest
}) {
  return (
    <button
      type={type}
      aria-label={label}
      className={cx(styles.iconButton, styles[variant], styles[size], className)}
      {...rest}
    >
      <Icon size={size === 'sm' ? 16 : 20} aria-hidden="true" />
    </button>
  );
}
