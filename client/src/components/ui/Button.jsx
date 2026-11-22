import { LoaderCircle } from 'lucide-react';
import { cx } from '../../lib/cx.js';
import styles from './Button.module.css';

/**
 * Text button. variant: primary (Cherry, call-to-action only) | secondary (Cocoa) | ghost.
 * Use IconButton for icon-only controls.
 */
export function Button({
  variant = 'secondary',
  size = 'md',
  leadingIcon: LeadingIcon,
  loading = false,
  type = 'button',
  disabled = false,
  className,
  children,
  ...rest
}) {
  return (
    <button
      type={type}
      className={cx(styles.button, styles[variant], styles[size], className)}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...rest}
    >
      {loading ? (
        <LoaderCircle className={styles.spinner} size={16} aria-hidden="true" />
      ) : LeadingIcon ? (
        <LeadingIcon size={16} aria-hidden="true" />
      ) : null}
      <span>{children}</span>
    </button>
  );
}
