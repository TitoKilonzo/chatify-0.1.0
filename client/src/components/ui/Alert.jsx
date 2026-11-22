import { CircleAlert, CircleCheck } from 'lucide-react';
import { cx } from '../../lib/cx.js';
import styles from './Alert.module.css';

/**
 * Inline message. variant "error" is announced immediately (role alert); "success" is announced
 * politely (role status). Meaning is carried by icon and text, never by color alone.
 */
export function Alert({ variant = 'error', children, className }) {
  const Icon = variant === 'success' ? CircleCheck : CircleAlert;
  return (
    <div role={variant === 'success' ? 'status' : 'alert'} className={cx(styles.alert, className)}>
      <Icon size={16} aria-hidden="true" className={styles.icon} />
      <p>{children}</p>
    </div>
  );
}
