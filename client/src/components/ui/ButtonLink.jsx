import { Link } from 'react-router-dom';
import { cx } from '../../lib/cx.js';
import styles from './Button.module.css';

/** A router link that looks like a Button. Use for navigation; use Button for actions. */
export function ButtonLink({
  variant = 'secondary',
  size = 'md',
  leadingIcon: LeadingIcon,
  className,
  children,
  ...rest
}) {
  return (
    <Link
      className={cx(styles.button, styles.link, styles[variant], styles[size], className)}
      {...rest}
    >
      {LeadingIcon ? <LeadingIcon size={16} aria-hidden="true" /> : null}
      <span>{children}</span>
    </Link>
  );
}
