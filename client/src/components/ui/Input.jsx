import { useId } from 'react';
import { CircleAlert } from 'lucide-react';
import { cx } from '../../lib/cx.js';
import styles from './Input.module.css';

/**
 * Labelled text input. The label is always present for assistive technology; pass hideLabel for
 * compact controls such as search boxes. Validation errors use an icon and text, not color alone,
 * because Cherry Red is reserved for key actions.
 */
export function Input({
  label,
  hideLabel = false,
  error,
  hint,
  leadingIcon: LeadingIcon,
  trailing,
  id: idProp,
  className,
  ...rest
}) {
  const autoId = useId();
  const id = idProp ?? autoId;
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;
  const showHint = Boolean(hint) && !error;
  const describedBy = error ? errorId : showHint ? hintId : undefined;

  return (
    <div className={cx(styles.field, className)}>
      <label htmlFor={id} className={hideLabel ? 'visually-hidden' : styles.label}>
        {label}
      </label>
      <div className={cx(styles.control, error && styles.invalid)}>
        {LeadingIcon ? <LeadingIcon className={styles.icon} size={16} aria-hidden="true" /> : null}
        <input
          id={id}
          className={styles.input}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          {...rest}
        />
        {trailing}
      </div>
      {showHint ? (
        <p id={hintId} className={styles.hint}>
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={errorId} className={styles.error} role="alert">
          <CircleAlert size={16} aria-hidden="true" />
          <span>{error}</span>
        </p>
      ) : null}
    </div>
  );
}
